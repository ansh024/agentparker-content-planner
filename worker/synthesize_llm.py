"""Real AI synthesis of a creator brief from a last30days report.

``create_brief_llm(report, topic)`` turns the engine's heuristically-ranked
candidates + clusters into a genuine creator brief via a subscription-billed
Claude call (see ``llm_client``). It returns a dict whose keys match the
``listening_briefs`` columns, or ``None`` so the caller falls back to the
deterministic template (``synthesize.create_brief``).

The single intelligent step of a scheduled run lives here; last30days is treated
purely as a retrieval + heuristic-ranking layer (REVIEW.md A1).
"""

from __future__ import annotations

import json
from typing import Any, Optional

from llm_client import generate_brief_json

SYSTEM_PROMPT = (
    "You are a content strategist who turns raw social/forum signal into a "
    "creator's daily brief. Be specific and evidence-grounded; never invent "
    "sources. Only cite URLs that appear in the provided candidates."
)

# Caps to keep the LLM input small — this is the only thing the model sees.
MAX_CANDIDATES = 25
MAX_CLUSTERS = 8
MAX_SNIPPET_CHARS = 280


def _topic_list(topic: dict[str, Any], key: str) -> list[str]:
    value = topic.get(key)
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []


def _compact_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    snippet = candidate.get("snippet") or candidate.get("summary") or ""
    if isinstance(snippet, str) and len(snippet) > MAX_SNIPPET_CHARS:
        snippet = snippet[:MAX_SNIPPET_CHARS].rstrip() + "…"
    return {
        "id": candidate.get("candidate_id") or candidate.get("id") or candidate.get("item_id"),
        "title": candidate.get("title") or "",
        "source": candidate.get("source") or candidate.get("platform") or "web",
        "url": candidate.get("url") or candidate.get("source_url") or "",
        "snippet": snippet,
        "engagement": candidate.get("engagement_score") or candidate.get("engagement"),
        "score": candidate.get("final_score") or candidate.get("score"),
    }


def _compact_cluster(cluster: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": cluster.get("title") or "",
        "summary": cluster.get("summary") or cluster.get("title") or "",
        "sources": cluster.get("sources") or [],
        "score": cluster.get("score"),
    }


def build_synthesis_input(report: dict[str, Any], topic: dict[str, Any]) -> dict[str, Any]:
    """Build the compact JSON payload the LLM sees."""
    candidates = (report.get("ranked_candidates") or [])[:MAX_CANDIDATES]
    clusters = (report.get("clusters") or [])[:MAX_CLUSTERS]
    return {
        "topic": topic.get("name") or report.get("topic") or "this topic",
        "audience": topic.get("audience") or "your audience",
        "content_format": topic.get("content_format") or "short-form video",
        "platform_focus": _topic_list(topic, "platform_focus"),
        "keywords": _topic_list(topic, "keywords"),
        "candidates": [_compact_candidate(c) for c in candidates if c],
        "clusters": [_compact_cluster(c) for c in clusters if c],
    }


def _build_user_prompt(payload: dict[str, Any]) -> str:
    content_format = payload["content_format"]
    schema_hint = {
        "headline": "string — what to make about the topic now",
        "what_changed": "2-3 sentences on the shift this week, grounded in the signals",
        "audience_pains": ["3-5 concrete pains in the audience's words"],
        "content_angles": [
            {
                "title": "creator-framed hook (NOT the raw source title)",
                "angle": "what the video/post actually says",
                "why": "why it will land now, citing the signal",
                "format": content_format,
                "evidence": [{"title": "...", "url": "...", "source": "..."}],
                "score": "number or null",
            }
        ],
        "scripts_or_hooks": ["3-5 ready-to-say hooks"],
        "source_citations": [{"title": "...", "url": "...", "source": "..."}],
        "top_pick": {"title": "...", "why": "the single thing to make today"},
    }
    return (
        "Create a creator's daily brief from the signal below.\n\n"
        f"Topic: {payload['topic']}\n"
        f"Audience: {payload['audience']}\n"
        f"Content format: {content_format}\n"
        f"Platform focus: {', '.join(payload['platform_focus']) or 'any'}\n\n"
        "Signal (ranked candidates and clusters as JSON):\n"
        f"{json.dumps({'candidates': payload['candidates'], 'clusters': payload['clusters']}, ensure_ascii=False)}\n\n"
        "Return STRICT JSON matching exactly this schema (same keys, same shape):\n"
        f"{json.dumps(schema_hint, ensure_ascii=False)}\n\n"
        "Rules: content_angles[].title must be a creator-framed hook, not the raw "
        "source title. Only cite URLs present in the candidates. Use the given "
        "content_format. Output ONLY the JSON object."
    )


def _as_str_list(value: Any, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out = [str(item).strip() for item in value if isinstance(item, (str, int, float)) and str(item).strip()]
    return out[:limit]


def _as_citation_list(value: Any, *, limit: int) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        out.append({
            "title": str(item.get("title") or item.get("source") or "Source"),
            "url": str(item.get("url") or ""),
            "source": str(item.get("source") or item.get("platform") or "web"),
        })
    return out[:limit]


def _normalize_angles(value: Any, content_format: str, *, limit: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        score = item.get("score")
        if isinstance(score, str):
            try:
                score = float(score)
            except ValueError:
                score = None
        if not isinstance(score, (int, float)):
            score = None
        out.append({
            "title": str(item.get("title") or "Untitled angle"),
            "angle": str(item.get("angle") or item.get("title") or ""),
            "why": str(item.get("why") or ""),
            "format": str(item.get("format") or content_format),
            "evidence": _as_citation_list(item.get("evidence"), limit=4),
            "score": score,
        })
    return out[:limit]


def _coerce_to_brief_columns(raw: dict[str, Any], topic: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Map the LLM's JSON onto the exact ``listening_briefs`` column set.

    The live schema (supabase/migrations/20260618_creator_grade_listening.sql)
    has NO ``top_pick`` and NO ``metadata`` column, so ``top_pick`` is folded
    into ``content_angles[0]`` / ``what_changed`` and the provider tag is dropped.
    Returns ``None`` if the result lacks the minimum required content.
    """
    content_format = topic.get("content_format") or "short-form video"
    topic_name = topic.get("name") or "this topic"

    headline = str(raw.get("headline") or "").strip()
    angles = _normalize_angles(raw.get("content_angles"), content_format, limit=6)
    if not headline or not angles:
        return None

    what_changed = str(raw.get("what_changed") or "").strip()

    # Fold top_pick (no DB column) into content_angles[0] + what_changed.
    top_pick = raw.get("top_pick")
    if isinstance(top_pick, dict):
        tp_title = str(top_pick.get("title") or "").strip()
        tp_why = str(top_pick.get("why") or "").strip()
        if tp_title or tp_why:
            angles[0].setdefault("top_pick", True)
            note = "Top pick today: " + (tp_title or angles[0]["title"])
            if tp_why:
                note += f" — {tp_why}"
            what_changed = (what_changed + ("\n\n" if what_changed else "") + note).strip()

    return {
        "headline": headline or f"What creators should make about {topic_name} now",
        "what_changed": what_changed,
        "audience_pains": _as_str_list(raw.get("audience_pains"), limit=5),
        "content_angles": angles,
        "scripts_or_hooks": _as_str_list(raw.get("scripts_or_hooks"), limit=5),
        "source_citations": _as_citation_list(raw.get("source_citations"), limit=12),
    }


def create_brief_llm(report: dict[str, Any], topic: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Synthesize a real creator brief, or ``None`` to fall back to the template.

    Never raises — any failure (no provider, bad JSON, empty content) degrades to
    ``None``.
    """
    try:
        payload = build_synthesis_input(report, topic)
        if not payload["candidates"] and not payload["clusters"]:
            return None
        user_prompt = _build_user_prompt(payload)
        raw, _provider = generate_brief_json(SYSTEM_PROMPT, user_prompt)
        if not isinstance(raw, dict):
            return None
        return _coerce_to_brief_columns(raw, topic)
    except Exception:
        return None
