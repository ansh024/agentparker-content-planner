from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Tuple
from uuid import uuid4

from synthesize import create_brief

DEFAULT_SOURCES = "reddit,hackernews,youtube,github,polymarket,grounding"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_topic_query(topic: dict[str, Any]) -> str:
    parts = [topic.get("name") or ""]
    keywords = topic.get("keywords") or []
    if keywords:
        parts.append(", ".join(keywords))
    if topic.get("audience"):
        parts.append(f"for {topic['audience']}")
    if topic.get("content_format"):
        parts.append(f"content format: {topic['content_format']}")
    if topic.get("competitors"):
        parts.append(f"competitors/tools: {', '.join(topic['competitors'])}")
    if topic.get("platform_focus"):
        parts.append(f"platforms: {', '.join(topic['platform_focus'])}")
    return " | ".join(part for part in parts if part).strip()


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


def run_last30days(topic: dict[str, Any], deep: bool = False) -> Tuple[dict[str, Any], Optional[str]]:
    memory_dir = Path(os.environ.get("LAST30DAYS_MEMORY_DIR", "/data/last30days")).expanduser()
    memory_dir.mkdir(parents=True, exist_ok=True)

    sources = os.environ.get("LAST30DAYS_SOURCES", DEFAULT_SOURCES)
    query = build_topic_query(topic)
    script = last30days_script_path()
    cmd = [
        os.environ.get("PYTHON_BIN", sys.executable),
        str(script),
        query,
        "--emit=json",
        "--store",
        "--quick",
        "--search",
        sources,
        "--save-dir",
        str(memory_dir),
    ]
    if deep:
        cmd.append("--deep-research")

    env = os.environ.copy()
    env.setdefault("LAST30DAYS_MEMORY_DIR", str(memory_dir))
    env.setdefault("LAST30DAYS_REASONING_PROVIDER", "openrouter")
    env.setdefault("INCLUDE_SOURCES", "reddit,hackernews,youtube,github,polymarket,grounding")
    if env.get("SCRAPECREATORS_API_KEY"):
        env["INCLUDE_SOURCES"] = env["INCLUDE_SOURCES"] + ",tiktok,instagram,threads,pinterest"

    proc = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("LAST30DAYS_TIMEOUT_SECONDS", "900")),
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "last30days failed").strip())

    report = extract_json(proc.stdout)
    raw_path = None
    artifacts = report.get("artifacts") or {}
    if isinstance(artifacts, dict):
        raw_path = artifacts.get("save_path") or artifacts.get("raw_output_path")
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

    brief = create_brief(report, topic)
    client.table("listening_briefs").insert({
        "topic_id": topic_id,
        "run_id": run_id,
        "user_id": user_id,
        **brief,
    }).execute()

    client.table("listening_runs").update({
        "status": "succeeded",
        "finished_at": utc_now(),
        "source_counts": source_counts(report),
        "query_plan": report.get("query_plan") or {},
        "warnings": report.get("warnings") or [],
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
