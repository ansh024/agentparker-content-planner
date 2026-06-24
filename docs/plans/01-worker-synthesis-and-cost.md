# WS-A — Worker: Real AI Synthesis (subscription-billed) + Cost-Efficient Retrieval

**Owner scope:** `worker/` ONLY. Do not touch `app/`, `api/`, or `vercel.json`.
**Goal:** Replace the templated brief with a genuine Claude-synthesized creator brief billed to
the user's Claude **subscription**, and make last30days retrieval cheap (skip its planner LLM,
free sources, heuristic rank).

## Context you need (read these first)
- `worker/bridge.py` — `run_last30days()` builds the CLI command; `sync_report_to_supabase()`
  persists clusters/hits and calls `create_brief(report, topic)` then inserts into
  `listening_briefs`.
- `worker/synthesize.py` — the current `create_brief()` TEMPLATE to replace.
- `worker/main.py` — FastAPI `/run-topic` and `/run-due-topics`. No change needed except maybe
  passing config through; keep its signature stable.
- `worker/vendor/last30days-skill/skills/last30days/scripts/last30days.py` — the engine. Relevant
  flags: `--plan` (JSON string or file path — **skips internal LLM planner**), `--quick`,
  `--search <csv sources>`, `--days`, `--emit=json`, `--store`, `--deep-research`,
  `--subreddits`, `--diagnose`.
- `worker/vendor/last30days-skill/CONFIGURATION.md` — reasoning-provider priority + source keys.
  Key fact: headless runs need a reasoning provider ONLY for planning/rerank when you don't pass
  `--plan`. We pass `--plan`, so confirm via `--diagnose` that a run completes without a paid
  LLM key. If the engine still demands a reasoning provider for rerank, prefer heuristic/no-LLM
  rerank; do NOT wire a paid provider for scheduled runs.

## Part 1 — Cost-efficient retrieval (`worker/bridge.py`)

1. Add `build_query_plan(topic) -> dict` that produces a deterministic last30days plan JSON from
   the topic, so the engine's internal LLM planner is skipped. Derive it from `topic["name"]`,
   `topic["keywords"]`, `topic.get("subreddits")`, `topic.get("competitors")`. Inspect the
   engine to learn the exact plan schema it accepts (search `last30days.py` / SKILL.md for
   `--plan` parsing and the plan keys it reads, e.g. queries/sources/entities). Match that schema
   exactly. If the schema is ambiguous, run the engine once with `--diagnose`/a sample to confirm.
2. Add `select_sources(topic) -> str`:
   - Base (always, all free): `reddit,hackernews,github,youtube,grounding`.
   - If `SCRAPECREATORS_API_KEY` is set AND `topic.platform_focus` (lowercased) mentions tiktok /
     instagram / threads, append those sources. Otherwise omit them.
3. Modify `run_last30days(topic, deep=False)`:
   - Always pass `--plan <json>` (from `build_query_plan`) and `--quick` and `--emit=json` and
     `--days <topic.lookback_days or 30>` and `--search <select_sources>` and `--save-dir`.
   - Only pass `--deep-research` when `deep=True` (manual "Deep run"). Add a one-line log warning
     that deep-research is the paid path (~$0.90/query via OpenRouter).
   - Keep `--store` optional behind env `LAST30DAYS_USE_STORE` (default off; we already dedupe via
     `listening_hits`).
   - Keep the existing env hardening (`BIRD_DISABLE_BROWSER_COOKIES=1`, `FROM_BROWSER=none`) — it
     prevents the Safari-cookie failure seen in prod.
   - Do NOT set `LAST30DAYS_REASONING_PROVIDER` to a paid provider for scheduled runs. Leave it
     unset/`auto`; with `--plan` the planner is skipped. If the engine errors without a provider
     during rerank, fall back to letting it run rerank-light (heuristic) — confirm via a `--mock`
     or `--diagnose` dry run that the pipeline completes with no paid LLM key present.

## Part 2 — Real AI synthesis (NEW `worker/synthesize_llm.py`)

Create `worker/synthesize_llm.py` exposing `create_brief_llm(report, topic) -> dict | None`.

1. **Build a compact synthesis input** from `report`: take top ~25 `ranked_candidates`
   (title, source/platform, url, snippet, engagement/final_score) and the `clusters`
   (title, summary, sources, score). Keep it small — this is the only thing the LLM sees.
2. **Prompt** (system + user). System: "You are a content strategist who turns raw social/forum
   signal into a creator's daily brief. Be specific and evidence-grounded; never invent sources."
   User: include topic name, audience, content_format, platform_focus, and the candidates/clusters
   JSON. Ask for STRICT JSON matching the schema below.
3. **Output schema (must match the `listening_briefs` columns currently written):**
   ```json
   {
     "headline": "string — what to make about <topic> now",
     "what_changed": "2-3 sentences on the shift this week, grounded in the signals",
     "audience_pains": ["3-5 concrete pains in the audience's words"],
     "content_angles": [
       {"title":"creator-framed hook (NOT the raw source title)",
        "angle":"what the video/post actually says",
        "why":"why it will land now, citing the signal",
        "format":"<topic.content_format>",
        "evidence":[{"title":"...","url":"...","source":"..."}],
        "score": <number or null>}
     ],
     "scripts_or_hooks": ["3-5 ready-to-say hooks"],
     "source_citations": [{"title":"...","url":"...","source":"..."}],
     "top_pick": {"title":"...","why":"the single thing to make today"}
   }
   ```
   `top_pick` is new — add it to the brief row only if the column exists; otherwise fold it into
   `content_angles[0]` and `what_changed`. CHECK the `listening_briefs` schema first (via Supabase
   or a migration file under `supabase/`) and only write columns that exist; extras go into a
   `metadata`/JSON column if present, else drop them. Do not break the insert in `bridge.py`.
4. **Model call with subscription billing — three-tier provider (`worker/llm_client.py` helper):**
   - **Tier 1 (preferred): `claude` CLI headless.** If `CLAUDE_CODE_OAUTH_TOKEN` is set, run:
     `claude -p <prompt> --output-format json --model <LISTENING_SYNTH_MODEL>` via `subprocess`,
     with `env` including `CLAUDE_CODE_OAUTH_TOKEN` and NOT `ANTHROPIC_API_KEY` (so it bills the
     subscription, not the API). Parse the CLI's JSON envelope → extract the assistant text →
     parse the strict-JSON brief. Set a timeout (e.g. 120s) and handle non-zero exit. Verify the
     exact `--output-format json` envelope shape by running `claude -p "hi" --output-format json`
     in the container during dev and parsing the `.result`/`.content` field accordingly.
   - **Tier 2: Anthropic Python SDK.** If no OAuth token but `ANTHROPIC_API_KEY` is set, call
     `anthropic` `messages.create(model=LISTENING_SYNTH_MODEL, max_tokens=2000, messages=[...])`.
     Use `claude-sonnet-4-6` default. (Per the claude-api skill: adaptive thinking only on 4.x;
     no `budget_tokens`, no sampling params. For Sonnet 4.6 set `output_config={"effort":"low"}`
     for a cheap, fast brief, or omit. Parse the JSON out of the text.)
   - **Tier 3: `None`** → caller falls back to the template.
   - Make the model id come from env `LISTENING_SYNTH_MODEL` (default `claude-sonnet-4-6`).
   - Robust JSON extraction: strip code fences, find first `{`…last `}`; on parse failure return
     `None` (→ template fallback). Never raise out of synthesis.
5. **Wire into `bridge.py`:** in `sync_report_to_supabase`, replace
   `brief = create_brief(report, topic)` with:
   ```python
   brief = create_brief_llm(report, topic) or create_brief(report, topic)
   ```
   Keep `create_brief` (template) as the guaranteed fallback. Tag the row (in metadata if a column
   exists) with which path produced it (`"synth":"llm"|"template"`) for observability.

## Part 3 — Packaging (`worker/Dockerfile`, `worker/requirements.txt`, env)

1. **Dockerfile:** add Node 20 + the Claude CLI so Tier 1 works in the deployed worker:
   - Install Node (e.g. `apt-get install -y nodejs npm` or NodeSource), then
     `npm install -g @anthropic-ai/claude-code`.
   - Keep the image lean; this only needs to run `claude -p`.
   - Do NOT bake any token into the image. `CLAUDE_CODE_OAUTH_TOKEN` is a Railway env var.
2. **requirements.txt:** add `anthropic` (for Tier 2). `claude-agent-sdk` is optional — the CLI
   subprocess approach avoids a hard Python dep; prefer the CLI subprocess for Tier 1.
3. **Env docs:** update `worker/README.md` and root `.env.example` with:
   - `CLAUDE_CODE_OAUTH_TOKEN` — "Run `claude setup-token` locally; paste into Railway. Bills the
     listening synthesis to your Claude subscription instead of API credits."
   - `LISTENING_SYNTH_MODEL` (default `claude-sonnet-4-6`).
   - `LAST30DAYS_USE_STORE` (default off).
   Note: do not put real secrets in `.env.example`.

## Tests / verification (do before declaring done)
- `worker/tests/` — add a unit test for `build_query_plan` (deterministic shape) and
  `select_sources` (free-by-default; SC sources only when key+platform present), and a test that
  `create_brief_llm` returns `None` cleanly when no provider is configured (so fallback holds).
- Mock the LLM call in tests (no network). Don't call the real CLI/API in unit tests.
- Run `python -c "import bridge, synthesize_llm, llm_client"` to confirm imports.
- Dry-run the engine with `--diagnose` to confirm a no-paid-LLM path exists; capture findings in a
  comment if the engine forces a provider.

## Guardrails
- Never let synthesis raise into the run — always degrade to template.
- Keep `listening_briefs` insert backward-compatible (only known columns).
- No secrets in code or `.env.example`.
- Keep `worker/main.py` endpoints’ signatures stable (WS-B calls `/run-due-topics`).
