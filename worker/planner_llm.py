"""Subscription-billed query planner for last30days.

The last30days engine is explicitly designed so the *host* LLM writes the query
plan and passes it via ``--plan`` — see the comment block in
``vendor/last30days-skill/skills/last30days/scripts/lib/planner.py`` ("YOU ARE
the planner ... the deterministic fallback below is the headless/cron path
only"). Its internal planner exists to paraphrase the topic, strip
intent-modifiers, OR keywords, and quote proper nouns so searches don't echo the
literal topic and return near-zero results (the documented "Hermes Agent Use
Cases" failure mode).

A deterministic plain plan (``bridge.build_query_plan``) reproduces exactly that
failure for keyword-shaped topics (``search_query = "AI video creation AI video
creation"``). So instead of skipping planning, we do it on the user's Claude
**subscription** (same ``llm_client`` chain as synthesis): smart planning, zero
API credits, and ``--plan`` still skips the engine's own paid LLM.

This module owns the planner prompt; the rules below mirror the engine's
``planner._build_prompt`` (kept in sync deliberately rather than imported, to
avoid pulling the engine's heavy ``lib`` dependency graph into the worker).
"""

from __future__ import annotations

from typing import Any, Optional

import llm_client

_PLANNER_SYSTEM = "You are the query planner for a live last-30-days research pipeline."

# Mirrors lib/planner.py::_build_prompt. If the engine prompt changes materially,
# update these rules too.
_PLAN_RULES = """Return JSON ONLY with this shape:
{
  "intent": "factual|product|concept|opinion|how_to|comparison|breaking_news|prediction",
  "freshness_mode": "strict_recent|balanced_recent|evergreen_ok",
  "cluster_mode": "none|story|workflow|market|debate",
  "source_weights": {"source_name": 1.0},
  "subqueries": [
    {"label": "short label",
     "search_query": "keyword style query for search APIs",
     "ranking_query": "natural language rewrite for reranking",
     "sources": ["reddit", "hackernews"],
     "weight": 1.0}
  ],
  "notes": ["optional short notes"]
}

Rules:
- emit 2 to 5 subqueries (how_to/opinion/product/breaking_news benefit from 4-5; factual/concept from 2)
- every subquery must include BOTH search_query and ranking_query
- sources must be drawn from the Available sources only
- search_query is concise and keyword-heavy; ranking_query reads like a natural-language question
- NEVER include temporal phrases in search_query ('last 30 days', 'recent', months, years)
- NEVER include meta-research phrases ('news', 'updates', 'latest developments')
- INTENT-MODIFIER HANDLING: if the topic contains phrases like {use cases, workflows, examples,
  tutorial, review, comparison, applications, in practice, production, how i use}, STRIP that
  phrase from every search_query (keep its meaning in ranking_query) and emit 4-5 paraphrases
  that each express the intent differently (e.g. 'production', 'workflow OR pipeline',
  'review OR experience', 'vs COMPETITOR', 'community discussion'). Broad retrieval, narrow ranking.
- DO NOT echo the user's full topic verbatim in search_query — that returns near-zero results
  because nobody posts that exact phrase. Quote only multi-word proper nouns; OR bare keywords.
- search_query should match how content is TITLED on the platforms.
- GitHub is best for engineering / dev-tool / open-source topics."""


def _topic_descriptor(topic: dict[str, Any]) -> str:
    name = (topic.get("name") or "").strip()
    parts = [name] if name else []
    keywords = topic.get("keywords") or []
    if keywords:
        parts.append("keywords: " + ", ".join(str(k) for k in keywords if k))
    audience = (topic.get("audience") or "").strip()
    if audience:
        parts.append(f"audience: {audience}")
    competitors = topic.get("competitors") or []
    if competitors:
        parts.append("tools/competitors: " + ", ".join(str(c) for c in competitors if c))
    content_format = (topic.get("content_format") or "").strip()
    if content_format:
        parts.append(f"content format: {content_format}")
    return " — ".join(parts) if parts else name


def build_query_plan_llm(topic: dict[str, Any], available_sources: list[str]) -> Optional[dict[str, Any]]:
    """Generate a last30days query plan on the Claude subscription.

    Returns a plan dict suitable for ``--plan`` (the engine sanitises it further
    via ``planner._sanitize_plan``), or ``None`` if no provider is configured or
    the model output is unusable — the caller then falls back to the
    deterministic ``bridge.build_query_plan``.
    """
    descriptor = _topic_descriptor(topic)
    if not descriptor:
        return None

    user = (
        f"Topic: {descriptor}\n"
        f"Depth: quick\n"
        f"Available sources: {', '.join(available_sources)}\n"
        f"Requested sources: {', '.join(available_sources)}\n\n"
        f"{_PLAN_RULES}"
    )

    try:
        plan, _provider = llm_client.generate_json(_PLANNER_SYSTEM, user, max_tokens=1200)
    except Exception:
        return None

    # Only accept a plan that actually carries usable subqueries; otherwise the
    # deterministic fallback is strictly safer than a malformed plan.
    if not isinstance(plan, dict):
        return None
    subqueries = plan.get("subqueries")
    if not isinstance(subqueries, list) or not any(
        isinstance(sq, dict) and str(sq.get("search_query") or "").strip() and str(sq.get("ranking_query") or "").strip()
        for sq in subqueries
    ):
        return None
    return plan
