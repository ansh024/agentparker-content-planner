from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Tuple
from uuid import uuid4

import llm_client
import planner_llm
from synthesize_llm import create_brief_llm

# Free, no-cost retrieval sources used on every scheduled run. ScrapeCreators
# sources (tiktok/instagram/threads) are added only when a topic asks for them
# and a key exists — see select_sources().
FREE_SOURCES = ["reddit", "hackernews", "github", "youtube", "grounding"]
SCRAPECREATORS_SOURCES = ["tiktok", "instagram", "threads"]
DEFAULT_SOURCES = ",".join(FREE_SOURCES)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_topic_query(topic: dict[str, Any]) -> str:
    parts = [topic.get("name") or ""]
    keywords = topic.get("keywords") or []
    if keywords:
        parts.append(" ".join(keywords))
    # Keep the engine query concise. Audience, tools, and platform focus are
    # still used by our synthesis layer, but adding them here can trigger
    # last30days comparison/coverage modes and break JSON output.
    return " ".join(part for part in parts if part).strip()


def _as_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


# last30days as retrieval-only — verified finding (REVIEW.md A1):
#   Read of vendor/.../lib/providers.resolve_runtime confirms that with
#   LAST30DAYS_REASONING_PROVIDER=auto and NO paid key (GOOGLE/OPENAI/XAI/
#   OPENROUTER), it returns (local-deterministic runtime, provider=None) and
#   never raises. planner.plan_query and rerank.rerank_candidates both branch on
#   `if provider and model` and fall back to deterministic/heuristic scoring when
#   provider is None. Passing --plan skips the planner entirely. A `--diagnose`
#   dry-run with all provider keys unset confirms: reasoning_provider="auto",
#   local_mode=true, providers all false, pipeline completes. => A scheduled run
#   costs ~$0; all real intelligence lives in create_brief_llm (subscription).
#   Only --deep-research forces a provider (OPENROUTER_API_KEY) — manual-only.
#
# Query PLANNING, however, is NOT free: a keyword-echo plan returns near-zero
# results (the engine's documented failure mode). So we generate the plan with a
# real Claude provider (planner_llm, subscription-billed) and pass it via --plan.
# There is deliberately NO deterministic fallback — if no Claude provider is
# configured the run fails loudly telling the operator to set CLAUDE_CODE_OAUTH_TOKEN
# or ANTHROPIC_API_KEY, rather than silently producing a broken search.


def select_sources(topic: dict[str, Any]) -> str:
    """Pick the comma-separated source list for a topic.

    Always returns the free base sources. Appends ScrapeCreators sources
    (tiktok/instagram/threads) only when ``SCRAPECREATORS_API_KEY`` is set AND
    the topic's ``platform_focus`` mentions one of them.
    """
    sources = list(FREE_SOURCES)
    if os.environ.get("SCRAPECREATORS_API_KEY"):
        focus = " ".join(_as_list(topic.get("platform_focus"))).lower()
        extras = [source for source in SCRAPECREATORS_SOURCES if source in focus]
        sources.extend(extras)
    # De-dupe preserving order.
    seen: set[str] = set()
    ordered = [s for s in sources if not (s in seen or seen.add(s))]
    return ",".join(ordered)


def last30days_script_path() -> Path:
    default_dir = Path(__file__).parent / "vendor" / "last30days-skill" / "skills" / "last30days"
    skill_dir = Path(os.environ.get("LAST30DAYS_SKILL_DIR", default_dir)).expanduser()
    return skill_dir / "scripts" / "last30days.py"


def extract_json(stdout: str) -> dict[str, Any]:
    start = stdout.find("{")
    end = stdout.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("last30days did not emit JSON")
    return json.loads(stdout[start:end + 1])


def run_last30days(topic: dict[str, Any], deep: bool = False, env_overrides: Optional[dict] = None) -> Tuple[dict[str, Any], Optional[str]]:
    # Retrieval-only cost model (docs/plans REVIEW.md A1):
    #  * --plan skips the engine's internal *paid* LLM planner. We supply the plan
    #    ourselves: an LLM-generated plan billed to the Claude SUBSCRIPTION
    #    (planner_llm). There is NO deterministic fallback — the engine authors
    #    intend the host LLM to be the planner, and a plain keyword echo
    #    under-retrieves (the documented near-zero-results failure mode). If no
    #    Claude provider is configured the run fails loudly (below).
    #  * Free sources + --quick + heuristic rerank → no paid reasoning provider.
    #  * --deep-research (paid) is wired ONLY to the manual "Deep run".
    sources = select_sources(topic)
    query = build_topic_query(topic)
    plan = planner_llm.build_query_plan_llm(topic, sources.split(","))
    planning_provider = llm_client.last_provider()  # "cli"=subscription, "api"=credits
    if plan is None:
        if not llm_client.provider_available():
            raise RuntimeError(
                "Listening requires a Claude provider for query planning. On the worker, set "
                "CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token` for subscription billing) or "
                "ANTHROPIC_API_KEY. There is no deterministic fallback — a keyword-echo plan "
                "returns near-zero results."
            )
        raise RuntimeError(
            "Query planning failed: a Claude provider is configured but returned no usable plan "
            "(check the worker logs and your Claude quota/rate limits)."
        )
    memory_dir = Path(os.environ.get("LAST30DAYS_MEMORY_DIR", "/data/last30days")).expanduser()
    memory_dir.mkdir(parents=True, exist_ok=True)

    lookback_days = int(topic.get("lookback_days") or 30)
    script = last30days_script_path()
    cmd = [
        os.environ.get("PYTHON_BIN", sys.executable),
        str(script),
        query,
        "--plan",
        json.dumps(plan),
        "--emit=json",
        "--quick",
        "--days",
        str(lookback_days),
        "--search",
        sources,
        "--save-dir",
        str(memory_dir),
    ]
    if deep:
        # Paid path: deep-research enables perplexity via OpenRouter (~$0.90/query).
        print(
            "[bridge] WARNING: --deep-research is the PAID path "
            "(~$0.90/query via OpenRouter); use only for manual Deep runs.",
            file=sys.stderr,
        )
        cmd.append("--deep-research")
    # Optional persistence to the engine's SQLite store; off by default since we
    # already dedupe via listening_hits.
    if os.environ.get("LAST30DAYS_USE_STORE", "").strip().lower() in {"1", "true", "yes", "on"}:
        cmd.append("--store")

    env = os.environ.copy()
    # User-supplied keys from Settings take precedence over env vars.
    if env_overrides:
        env.update({k: v for k, v in env_overrides.items() if v})
    env.setdefault("LAST30DAYS_MEMORY_DIR", str(memory_dir))
    # Do NOT force a paid reasoning provider on scheduled runs. With --plan the
    # planner is skipped; with no paid key the engine reranks heuristically and
    # never raises (providers.resolve_runtime returns a local/None provider).
    # Leaving this unset/auto keeps cost at ~$0. (REVIEW.md A1.)
    env.setdefault("LAST30DAYS_REASONING_PROVIDER", "auto")
    env.setdefault("INCLUDE_SOURCES", sources)
    # Env hardening: prevents the Safari-cookie failure seen in prod.
    env.setdefault("BIRD_DISABLE_BROWSER_COOKIES", "1")
    env.setdefault("FROM_BROWSER", "none")

    proc = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("LAST30DAYS_TIMEOUT_SECONDS", "900")),
        check=False,
    )
    report = None
    parse_error = None
    try:
        report = extract_json(proc.stdout)
    except ValueError as exc:
        parse_error = exc

    if proc.returncode != 0:
        if report is None:
            raise RuntimeError((proc.stderr or proc.stdout or str(parse_error) or "last30days failed").strip())
        report.setdefault("warnings", [])
        report["warnings"].append(f"last30days exited with code {proc.returncode} after emitting JSON.")

    raw_path = None
    artifacts = report.get("artifacts") or {}
    if isinstance(artifacts, dict):
        raw_path = artifacts.get("save_path") or artifacts.get("raw_output_path")
    # Record which billing tier served query planning so the run is auditable.
    report["ai_planning_provider"] = planning_provider
    return report, raw_path


def source_counts(report: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in report.get("ranked_candidates") or []:
        source = item.get("source") or item.get("platform") or "unknown"
        counts[source] = counts.get(source, 0) + 1
    for source, items in (report.get("items_by_source") or {}).items():
        counts[source] = max(counts.get(source, 0), len(items or []))
    return counts


def cluster_payload(
    cluster: dict[str, Any],
    *,
    run_id: str,
    topic_id: str,
    user_id: str,
) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "run_id": run_id,
        "topic_id": topic_id,
        "user_id": user_id,
        "title": cluster.get("title") or "Untitled cluster",
        "summary": cluster.get("summary") or cluster.get("title") or "",
        "score": cluster.get("score"),
        "sources": cluster.get("sources") or [],
        "uncertainty": cluster.get("uncertainty"),
        "metadata": {
            "upstream_cluster_id": cluster.get("cluster_id"),
            "candidate_ids": cluster.get("candidate_ids") or [],
            "representative_ids": cluster.get("representative_ids") or [],
        },
    }


def candidate_payload(
    candidate: dict[str, Any],
    *,
    run_id: str,
    cluster_id: Optional[str],
    topic_id: str,
    user_id: str,
) -> Optional[dict[str, Any]]:
    url = candidate.get("url") or candidate.get("source_url")
    if not url:
        return None
    return {
        "run_id": run_id,
        "cluster_id": cluster_id,
        "topic_id": topic_id,
        "user_id": user_id,
        "source_url": url,
        "platform": candidate.get("source") or candidate.get("platform"),
        "title": candidate.get("title") or "",
        "snippet": candidate.get("snippet") or candidate.get("summary") or "",
        "author": candidate.get("author") or candidate.get("creator") or "",
        "engagement_score": int(candidate.get("engagement_score") or candidate.get("engagement") or 0),
        "published_at": candidate.get("published_at") or candidate.get("created_at"),
        "final_score": candidate.get("final_score") or candidate.get("score"),
        "relevance_score": candidate.get("relevance_score") or candidate.get("relevance"),
        "fun_score": candidate.get("fun_score") or candidate.get("fun"),
        "source_quality": candidate.get("source_quality"),
        "last_seen_at": utc_now(),
        "raw_item": candidate,
    }


def _cluster_id_map(cluster_rows: list[dict[str, Any]]) -> dict[str, str]:
    mapping = {}
    for row in cluster_rows:
        upstream = row.get("metadata", {}).get("upstream_cluster_id")
        if upstream is not None:
            mapping[str(upstream)] = row["id"]
    return mapping


def sync_report_to_supabase(client: Any, topic: dict[str, Any], run_id: str, report: dict[str, Any], raw_path: Optional[str]) -> dict[str, int]:
    topic_id = topic["id"]
    user_id = topic["user_id"]
    clusters = report.get("clusters") or []
    candidates = report.get("ranked_candidates") or []
    candidates_by_id = {
        str(candidate.get("candidate_id") or candidate.get("id") or candidate.get("item_id")): candidate
        for candidate in candidates
    }

    cluster_rows = [
        cluster_payload(cluster, run_id=run_id, topic_id=topic_id, user_id=user_id)
        for cluster in clusters
    ]
    for row in cluster_rows:
        candidate_ids = row["metadata"].get("candidate_ids") or row["metadata"].get("representative_ids") or []
        source_urls = [
            candidates_by_id[str(candidate_id)].get("url") or candidates_by_id[str(candidate_id)].get("source_url")
            for candidate_id in candidate_ids
            if str(candidate_id) in candidates_by_id
        ]
        row["metadata"]["source_urls"] = [url for url in source_urls if url][:8]
    if cluster_rows:
        client.table("listening_clusters").insert(cluster_rows).execute()

    cluster_map = _cluster_id_map(cluster_rows)
    hit_ids_by_cluster: dict[str, list[str]] = {}
    total_new = 0

    for candidate in candidates:
        upstream_cluster = candidate.get("cluster_id")
        cluster_id = cluster_map.get(str(upstream_cluster)) if upstream_cluster is not None else None
        payload = candidate_payload(
            candidate,
            run_id=run_id,
            cluster_id=cluster_id,
            topic_id=topic_id,
            user_id=user_id,
        )
        if payload is None:
            continue

        existing = client.table("listening_hits") \
            .select("id,sighting_count,first_seen_at") \
            .eq("topic_id", topic_id) \
            .eq("source_url", payload["source_url"]) \
            .limit(1) \
            .execute()
        rows = existing.data or []
        if rows:
            hit_id = rows[0]["id"]
            payload["sighting_count"] = int(rows[0].get("sighting_count") or 1) + 1
            payload["first_seen_at"] = rows[0].get("first_seen_at")
            client.table("listening_hits").update(payload).eq("id", hit_id).execute()
        else:
            payload["first_seen_at"] = payload["last_seen_at"]
            inserted = client.table("listening_hits").insert(payload).execute()
            hit_id = inserted.data[0]["id"] if inserted.data else ""
            total_new += 1

        if cluster_id and hit_id:
            hit_ids_by_cluster.setdefault(cluster_id, []).append(hit_id)

    for cluster_id, hit_ids in hit_ids_by_cluster.items():
        client.table("listening_clusters").update({"representative_hit_ids": hit_ids[:8]}).eq("id", cluster_id).execute()

    # Real AI synthesis (subscription-billed). No template fallback — a templated
    # brief is the low-quality output we set out to replace, so if no Claude
    # provider produces a brief we fail the run loudly instead of storing fake
    # intelligence. create_brief_llm never raises; it returns None on failure.
    brief = create_brief_llm(report, topic)
    synthesis_provider = llm_client.last_provider()  # "cli"=subscription, "api"=credits
    if brief is None:
        if not llm_client.provider_available():
            raise RuntimeError(
                "Listening requires a Claude provider for brief synthesis. On the worker, set "
                "CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token`) or ANTHROPIC_API_KEY."
            )
        raise RuntimeError(
            "Brief synthesis failed: a Claude provider is configured but returned no usable brief "
            "(check the worker logs and your Claude quota/rate limits)."
        )
    client.table("listening_briefs").insert({
        "topic_id": topic_id,
        "run_id": run_id,
        "user_id": user_id,
        **brief,
    }).execute()

    # Make the AI billing tier auditable: "cli" draws on the Claude subscription
    # (the intended path, $0 API), "api" means it fell back to API credits.
    warnings = list(report.get("warnings") or [])
    planning_provider = report.get("ai_planning_provider")
    warnings.append(
        f"ai_billing: planning={planning_provider or 'none'}, "
        f"synthesis={synthesis_provider or 'none'}"
    )

    client.table("listening_runs").update({
        "status": "succeeded",
        "finished_at": utc_now(),
        "source_counts": source_counts(report),
        "query_plan": report.get("query_plan") or {},
        "warnings": warnings,
        "raw_output_path": raw_path,
        "total_candidates": len(candidates),
        "total_clusters": len(clusters),
        "total_new_hits": total_new,
    }).eq("id", run_id).execute()

    client.table("listening_topics").update({
        "last_run_at": utc_now(),
        "last_run_id": run_id,
    }).eq("id", topic_id).execute()

    return {
        "total_new_hits": total_new,
        "total_candidates": len(candidates),
        "total_clusters": len(clusters),
    }
