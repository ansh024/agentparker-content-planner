"""Unit tests for the cost-efficient retrieval + LLM synthesis layer.

These tests mock the LLM entirely — no network, no real CLI/API call.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import bridge  # noqa: E402
import llm_client  # noqa: E402
import synthesize_llm  # noqa: E402


SAMPLE_REPORT = {
    "ranked_candidates": [
        {
            "candidate_id": "c1",
            "title": "Devs argue about AI code review",
            "source": "reddit",
            "url": "https://reddit.com/r/x/1",
            "snippet": "Big thread comparing tools",
            "engagement_score": 120,
            "final_score": 0.91,
        },
        {
            "candidate_id": "c2",
            "title": "New CLI dropped",
            "source": "hackernews",
            "url": "https://news.ycombinator.com/item?id=2",
            "snippet": "Show HN",
            "final_score": 0.8,
        },
    ],
    "clusters": [
        {"title": "AI review tooling", "summary": "People debate accuracy", "sources": ["reddit"], "score": 0.9},
    ],
}

TOPIC = {
    "id": "topic-1",
    "user_id": "user-1",
    "name": "AI code review",
    "keywords": ["ai code review", "pr automation"],
    "audience": "staff engineers",
    "content_format": "short-form video",
    "platform_focus": ["youtube"],
    "subreddits": ["ExperiencedDevs"],
    "competitors": ["CodeRabbit"],
}


class RunGuardTests(unittest.TestCase):
    """There is no deterministic fallback — a run must fail loudly without a Claude provider."""

    def test_run_raises_when_no_plan_and_no_provider(self):
        with mock.patch.object(bridge.planner_llm, "build_query_plan_llm", return_value=None), \
             mock.patch.object(bridge.llm_client, "provider_available", return_value=False):
            with self.assertRaises(RuntimeError) as ctx:
                bridge.run_last30days(TOPIC)
        self.assertIn("Claude provider", str(ctx.exception))

    def test_run_raises_when_provider_present_but_plan_fails(self):
        with mock.patch.object(bridge.planner_llm, "build_query_plan_llm", return_value=None), \
             mock.patch.object(bridge.llm_client, "provider_available", return_value=True):
            with self.assertRaises(RuntimeError) as ctx:
                bridge.run_last30days(TOPIC)
        self.assertIn("planning failed", str(ctx.exception).lower())

    def test_bridge_has_no_template_fallback(self):
        # The deterministic planner and the template synthesizer are gone.
        self.assertFalse(hasattr(bridge, "build_query_plan"))
        self.assertFalse(hasattr(bridge, "create_brief"))


class SelectSourcesTests(unittest.TestCase):
    def test_free_sources_by_default(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SCRAPECREATORS_API_KEY", None)
            sources = bridge.select_sources(TOPIC).split(",")
        self.assertEqual(sources, ["reddit", "hackernews", "github", "youtube", "grounding"])

    def test_scrapecreators_sources_require_key_and_platform(self):
        topic = dict(TOPIC, platform_focus=["tiktok", "instagram"])
        with mock.patch.dict(os.environ, {"SCRAPECREATORS_API_KEY": "x"}, clear=False):
            sources = bridge.select_sources(topic).split(",")
        self.assertIn("tiktok", sources)
        self.assertIn("instagram", sources)
        self.assertNotIn("threads", sources)  # not in platform_focus

    def test_scrapecreators_omitted_without_key(self):
        topic = dict(TOPIC, platform_focus=["tiktok"])
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SCRAPECREATORS_API_KEY", None)
            sources = bridge.select_sources(topic).split(",")
        self.assertNotIn("tiktok", sources)

    def test_scrapecreators_omitted_when_platform_focus_absent(self):
        topic = dict(TOPIC, platform_focus=["youtube"])
        with mock.patch.dict(os.environ, {"SCRAPECREATORS_API_KEY": "x"}, clear=False):
            sources = bridge.select_sources(topic).split(",")
        for extra in ("tiktok", "instagram", "threads"):
            self.assertNotIn(extra, sources)


class CreateBriefLlmTests(unittest.TestCase):
    def test_returns_none_when_no_provider_configured(self):
        # No OAuth token, no API key → both tiers return None → caller falls back.
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None)
            os.environ.pop("ANTHROPIC_API_KEY", None)
            result = synthesize_llm.create_brief_llm(SAMPLE_REPORT, TOPIC)
        self.assertIsNone(result)

    def test_returns_brief_columns_when_llm_succeeds(self):
        fake_llm_json = {
            "headline": "Make a teardown of AI review tools",
            "what_changed": "Debate spiked this week.",
            "audience_pains": ["Tools miss real bugs"],
            "content_angles": [
                {
                    "title": "I let 3 AI reviewers fight over my PR",
                    "angle": "Side-by-side accuracy test",
                    "why": "Reddit thread c1 is blowing up",
                    "format": "short-form video",
                    "evidence": [{"title": "thread", "url": "https://reddit.com/r/x/1", "source": "reddit"}],
                    "score": 0.91,
                }
            ],
            "scripts_or_hooks": ["Which AI reviewer actually caught the bug?"],
            "source_citations": [{"title": "thread", "url": "https://reddit.com/r/x/1", "source": "reddit"}],
            "top_pick": {"title": "The teardown", "why": "Highest engagement signal"},
        }
        with mock.patch.object(synthesize_llm, "generate_brief_json", return_value=(fake_llm_json, "cli")):
            result = synthesize_llm.create_brief_llm(SAMPLE_REPORT, TOPIC)
        self.assertIsNotNone(result)
        # Only the real listening_briefs columns are present.
        self.assertEqual(
            set(result.keys()),
            {"headline", "what_changed", "audience_pains", "content_angles", "scripts_or_hooks", "source_citations"},
        )
        self.assertNotIn("top_pick", result)  # folded in, not a column
        self.assertIn("Top pick today", result["what_changed"])
        self.assertEqual(result["content_angles"][0]["score"], 0.91)

    def test_returns_none_on_unparseable_llm_output(self):
        with mock.patch.object(synthesize_llm, "generate_brief_json", return_value=(None, None)):
            result = synthesize_llm.create_brief_llm(SAMPLE_REPORT, TOPIC)
        self.assertIsNone(result)

    def test_returns_none_when_llm_brief_missing_required_fields(self):
        with mock.patch.object(synthesize_llm, "generate_brief_json", return_value=({"what_changed": "x"}, "cli")):
            result = synthesize_llm.create_brief_llm(SAMPLE_REPORT, TOPIC)
        self.assertIsNone(result)


class LlmClientTests(unittest.TestCase):
    def test_extract_json_object_strips_code_fences(self):
        text = "```json\n{\"a\": 1}\n```"
        self.assertEqual(llm_client.extract_json_object(text), {"a": 1})

    def test_extract_json_object_handles_prose_around_json(self):
        text = 'Sure! Here it is: {"headline": "hi"} hope that helps'
        self.assertEqual(llm_client.extract_json_object(text), {"headline": "hi"})

    def test_extract_json_object_returns_none_on_garbage(self):
        self.assertIsNone(llm_client.extract_json_object("no json here"))
        self.assertIsNone(llm_client.extract_json_object(None))

    def test_extract_cli_text_prefers_result_field(self):
        self.assertEqual(llm_client._extract_cli_text({"result": "hello"}), "hello")

    def test_extract_cli_text_handles_content_blocks(self):
        envelope = {"content": [{"type": "text", "text": "part"}, {"type": "tool_use"}]}
        self.assertEqual(llm_client._extract_cli_text(envelope), "part")

    def test_generate_brief_json_returns_none_with_no_provider(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None)
            os.environ.pop("ANTHROPIC_API_KEY", None)
            brief, tag = llm_client.generate_brief_json("sys", "user")
        self.assertIsNone(brief)
        self.assertIsNone(tag)

    def test_cli_tier_never_passes_api_key_and_parses_envelope(self):
        captured = {}

        class FakeProc:
            returncode = 0
            stdout = '{"result": "{\\"headline\\": \\"h\\", \\"content_angles\\": []}"}'

        def fake_run(cmd, env=None, **kwargs):
            captured["env"] = env
            captured["cmd"] = cmd
            return FakeProc()

        env = {"CLAUDE_CODE_OAUTH_TOKEN": "secret-token", "ANTHROPIC_API_KEY": "should-be-stripped"}
        with mock.patch.dict(os.environ, env, clear=False):
            with mock.patch.object(llm_client.subprocess, "run", side_effect=fake_run):
                brief, tag = llm_client.generate_brief_json("sys", "user")
        self.assertEqual(tag, "cli")
        self.assertEqual(brief, {"headline": "h", "content_angles": []})
        # Subscription billing: API key must be stripped from the CLI env.
        self.assertNotIn("ANTHROPIC_API_KEY", captured["env"])
        self.assertEqual(captured["env"].get("CLAUDE_CODE_OAUTH_TOKEN"), "secret-token")


if __name__ == "__main__":
    unittest.main()
