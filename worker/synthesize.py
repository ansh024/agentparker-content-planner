from __future__ import annotations

from typing import Any


def _candidate_lookup(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    candidates = report.get("ranked_candidates") or []
    return {
        str(candidate.get("candidate_id") or candidate.get("id") or candidate.get("item_id")): candidate
        for candidate in candidates
        if candidate
    }


def _citation_from_candidate(candidate: dict[str, Any]) -> dict[str, str]:
    return {
        "title": candidate.get("title") or candidate.get("source") or "Source",
        "url": candidate.get("url") or candidate.get("source_url") or "",
        "source": candidate.get("source") or candidate.get("platform") or "web",
    }


def create_brief(report: dict[str, Any], topic: dict[str, Any]) -> dict[str, Any]:
    clusters = report.get("clusters") or []
    candidates_by_id = _candidate_lookup(report)
    topic_name = topic.get("name") or report.get("topic") or "this topic"
    audience = topic.get("audience") or "your audience"
    content_format = topic.get("content_format") or "short-form video"

    citations: list[dict[str, str]] = []
    content_angles: list[dict[str, Any]] = []

    for cluster in clusters[:6]:
        candidate_ids = cluster.get("candidate_ids") or cluster.get("representative_ids") or []
        evidence = [
            _citation_from_candidate(candidates_by_id[str(candidate_id)])
            for candidate_id in candidate_ids
            if str(candidate_id) in candidates_by_id
        ][:3]
        citations.extend([item for item in evidence if item.get("url")])
        title = cluster.get("title") or "Emerging discussion"
        summary = cluster.get("summary") or title
        sources = cluster.get("sources") or sorted(
            {item.get("source") for item in evidence if item.get("source")}
        )
        content_angles.append({
            "title": title,
            "angle": summary,
            "why": f"This has traction across {', '.join(sources) if sources else 'multiple sources'} and can be reframed for {audience}.",
            "format": content_format,
            "evidence": evidence,
            "score": cluster.get("score"),
        })

    if not content_angles:
        fallback_candidates = report.get("ranked_candidates") or []
        for candidate in fallback_candidates[:3]:
            citation = _citation_from_candidate(candidate)
            citations.append(citation)
            content_angles.append({
                "title": candidate.get("title") or "Fresh discussion to unpack",
                "angle": candidate.get("snippet") or candidate.get("title") or "",
                "why": f"Useful raw signal for {audience}; validate against your niche before publishing.",
                "format": content_format,
                "evidence": [citation] if citation.get("url") else [],
                "score": candidate.get("final_score") or candidate.get("score"),
            })

    hooks = [
        f"What nobody tells you about {angle['title']}"
        for angle in content_angles[:3]
        if angle.get("title")
    ]

    audience_pains = [
        f"Knowing which {topic_name} trends are real versus generic SEO noise",
        f"Turning scattered discussions into specific {content_format} ideas",
        "Finding cited evidence before recording or publishing",
    ]

    what_changed = (
        f"Found {len(report.get('ranked_candidates') or [])} candidates across "
        f"{len(clusters)} clusters. Lead with the strongest repeated discussions, not isolated links."
    )

    return {
        "headline": f"What creators should make about {topic_name} now",
        "what_changed": what_changed,
        "audience_pains": audience_pains,
        "content_angles": content_angles[:6],
        "scripts_or_hooks": hooks[:5],
        "source_citations": citations[:12],
    }

