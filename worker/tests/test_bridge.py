import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import bridge
from bridge import build_topic_query, candidate_payload, source_counts, sync_report_to_supabase

# A minimal valid synthesized brief; synthesis has no template fallback, so the
# sync path requires create_brief_llm to return one.
_FAKE_BRIEF = {
    "headline": "x",
    "what_changed": "y",
    "audience_pains": [],
    "content_angles": [{"title": "a", "angle": "b", "why": "c"}],
    "scripts_or_hooks": [],
    "source_citations": [],
}


class FakeResult:
    def __init__(self, data=None):
        self.data = data or []


class FakeTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name
        self.action = None
        self.payload = None
        self.filters = []

    def select(self, *_args):
        self.action = "select"
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        if self.action == "select":
            result = rows
            for key, value in self.filters:
                result = [row for row in result if row.get(key) == value]
            return FakeResult(result)
        if self.action == "insert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for payload in payloads:
                row = dict(payload)
                row.setdefault("id", f"{self.name}-{len(rows) + 1}")
                rows.append(row)
                inserted.append(row)
            return FakeResult(inserted)
        if self.action == "update":
            updated = []
            for row in rows:
                if all(row.get(key) == value for key, value in self.filters):
                    row.update(self.payload)
                    updated.append(row)
            return FakeResult(updated)
        return FakeResult()


class FakeClient:
    def __init__(self, db):
        self.db = db

    def table(self, name):
        return FakeTable(self.db, name)


class BridgeTests(unittest.TestCase):
    def test_build_topic_query_includes_creator_intent(self):
        query = build_topic_query({
            "name": "AI product shoot",
            "keywords": ["product photography", "AI backgrounds"],
            "audience": "DTC founders",
            "content_format": "short-form video",
            "competitors": ["Flair", "Pebblely"],
            "platform_focus": ["youtube", "instagram"],
        })

        self.assertIn("AI product shoot", query)
        self.assertIn("product photography", query)
        self.assertNotIn("DTC founders", query)
        self.assertNotIn("Flair", query)
        self.assertNotIn("youtube", query)
        self.assertNotIn("|", query)
        self.assertNotIn("competitors/tools", query)

    def test_candidate_payload_maps_scores_and_raw_item(self):
        payload = candidate_payload({
            "candidate_id": "c1",
            "url": "https://example.com/post",
            "source": "reddit",
            "title": "A useful thread",
            "snippet": "People are comparing workflows",
            "score": 0.87,
            "relevance_score": 0.9,
            "fun_score": 0.4,
            "source_quality": 0.8,
        }, run_id="run-1", cluster_id="cluster-1", topic_id="topic-1", user_id="user-1")

        self.assertEqual(payload["source_url"], "https://example.com/post")
        self.assertEqual(payload["platform"], "reddit")
        self.assertEqual(payload["final_score"], 0.87)
        self.assertEqual(payload["raw_item"]["candidate_id"], "c1")

    def test_source_counts_uses_candidates_and_source_items(self):
        counts = source_counts({
            "ranked_candidates": [{"source": "reddit"}, {"source": "reddit"}],
            "items_by_source": {"youtube": [{"id": 1}, {"id": 2}, {"id": 3}]},
        })

        self.assertEqual(counts["reddit"], 2)
        self.assertEqual(counts["youtube"], 3)

    def test_duplicate_urls_increment_sighting_count(self):
        db = {
            "listening_hits": [{
                "id": "hit-1",
                "topic_id": "topic-1",
                "source_url": "https://example.com/post",
                "sighting_count": 2,
                "first_seen_at": "2026-06-17T00:00:00+00:00",
            }],
            "listening_runs": [{"id": "run-1"}],
            "listening_topics": [{"id": "topic-1"}],
        }
        client = FakeClient(db)
        report = {
            "clusters": [],
            "ranked_candidates": [{
                "candidate_id": "c1",
                "url": "https://example.com/post",
                "source": "reddit",
                "title": "Existing result",
            }],
        }

        with mock.patch.object(bridge, "create_brief_llm", return_value=dict(_FAKE_BRIEF)):
            stats = sync_report_to_supabase(
                client,
                {"id": "topic-1", "user_id": "user-1", "name": "AI ads"},
                "run-1",
                report,
                None,
            )

        self.assertEqual(stats["total_new_hits"], 0)
        self.assertEqual(db["listening_hits"][0]["sighting_count"], 3)
        # The run records which AI billing tier served it (auditable subscription
        # vs API-credit usage).
        run_warnings = db["listening_runs"][0].get("warnings") or []
        self.assertTrue(
            any(str(w).startswith("ai_billing:") for w in run_warnings),
            f"expected an ai_billing warning, got {run_warnings}",
        )


if __name__ == "__main__":
    unittest.main()
