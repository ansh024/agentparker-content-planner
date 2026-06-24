"""Tests for the subscription-billed query planner (planner_llm).

All LLM calls are mocked — no network, no real CLI/API.
"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import planner_llm  # noqa: E402

TOPIC = {
    "name": "AI video creation",
    "keywords": ["AI video creation", "faceless channels"],
    "audience": "creators selling templates",
    "competitors": ["Runway", "HeyGen"],
    "content_format": "short-form video",
}
SOURCES = ["reddit", "hackernews", "github", "youtube", "grounding"]

GOOD_PLAN = {
    "intent": "product",
    "freshness_mode": "balanced_recent",
    "cluster_mode": "debate",
    "source_weights": {s: 1.0 for s in SOURCES},
    "subqueries": [
        {"label": "tools", "search_query": "Runway OR HeyGen AI video",
         "ranking_query": "Which AI video tools are creators actually using now?",
         "sources": ["reddit", "youtube"], "weight": 1.0},
        {"label": "faceless", "search_query": "faceless channel automation",
         "ranking_query": "How are faceless creators automating video?",
         "sources": ["reddit"], "weight": 0.8},
    ],
}


class TestPlannerLlm(unittest.TestCase):
    def test_returns_plan_when_provider_yields_subqueries(self):
        with mock.patch.object(planner_llm.llm_client, "generate_json", return_value=(GOOD_PLAN, "cli")):
            plan = planner_llm.build_query_plan_llm(TOPIC, SOURCES)
        self.assertIsNotNone(plan)
        self.assertEqual(plan["intent"], "product")
        self.assertGreaterEqual(len(plan["subqueries"]), 2)

    def test_none_when_no_provider(self):
        with mock.patch.object(planner_llm.llm_client, "generate_json", return_value=(None, None)):
            self.assertIsNone(planner_llm.build_query_plan_llm(TOPIC, SOURCES))

    def test_none_when_plan_has_no_usable_subqueries(self):
        bad = {"intent": "product", "subqueries": [{"label": "x"}]}  # missing search/ranking
        with mock.patch.object(planner_llm.llm_client, "generate_json", return_value=(bad, "cli")):
            self.assertIsNone(planner_llm.build_query_plan_llm(TOPIC, SOURCES))

    def test_none_on_provider_exception(self):
        with mock.patch.object(planner_llm.llm_client, "generate_json", side_effect=RuntimeError("boom")):
            self.assertIsNone(planner_llm.build_query_plan_llm(TOPIC, SOURCES))

    def test_llm_plan_avoids_literal_topic_echo(self):
        # The whole point: the LLM plan must NOT echo the literal topic the way the
        # deterministic fallback does ("AI video creation AI video creation").
        with mock.patch.object(planner_llm.llm_client, "generate_json", return_value=(GOOD_PLAN, "cli")):
            plan = planner_llm.build_query_plan_llm(TOPIC, SOURCES)
        for sq in plan["subqueries"]:
            self.assertNotIn("AI video creation AI video creation", sq["search_query"])

    def test_descriptor_includes_keywords_and_audience(self):
        desc = planner_llm._topic_descriptor(TOPIC)
        self.assertIn("AI video creation", desc)
        self.assertIn("faceless channels", desc)
        self.assertIn("creators selling templates", desc)

    def test_empty_topic_returns_none(self):
        with mock.patch.object(planner_llm.llm_client, "generate_json", return_value=(GOOD_PLAN, "cli")):
            self.assertIsNone(planner_llm.build_query_plan_llm({}, SOURCES))


if __name__ == "__main__":
    unittest.main()
