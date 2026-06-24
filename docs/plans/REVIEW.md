# Plan Review — System-Analyst + Developer Stress Test

> Read this AFTER your workstream file and BEFORE coding. These are binding amendments that
> override/clarify the workstream docs where they conflict. Found by reviewing the plan for
> loopholes before execution.

## A. Architecture-level findings (system analyst)

**A1 — Treat last30days as a *retrieval layer only*; never depend on its LLM.**
The cost-efficiency thesis assumes `--plan` removes the engine's LLM cost. Risk: the engine may
still invoke a reasoning provider for reranking/synthesis even with `--plan`, or refuse to run
headless without a provider key. **Binding rule:** the worker must treat last30days purely as a
multi-source fetcher + heuristic ranker. WS-A must verify with `--diagnose` and by reading the
engine that a scheduled run completes with NO paid reasoning-provider key set. If the engine
*forces* a provider for rerank, do the cheapest thing that keeps cost ~0: rely on engine heuristic
ranking and skip its LLM synthesis — **all real intelligence happens in our subscription-billed
`create_brief_llm`**, which only needs the `ranked_candidates`/`clusters` arrays. Our brief quality
must NOT depend on the engine's own LLM. Document what you find in a `worker/` code comment.

**A2 — Subscription billing: ToS + quota + token reality.**
Using a personal Claude subscription token (`CLAUDE_CODE_OAUTH_TOKEN`) for an automated backend is
a gray area in consumer ToS and is subject to subscription rate windows (5-hour / weekly caps). For
this single-user dogfood at ~3 synth calls/day it's negligible, but: (1) tokens expire — the
Tier-2 (API) and Tier-3 (template) fallbacks are mandatory, not optional; (2) **never log the
token**; (3) surface in `worker/README.md` that this consumes subscription quota and how to
regenerate via `claude setup-token`. The whole point (no per-token API $) holds, with safe
degradation.

**A3 — Claude CLI headless auth must actually work in the container.**
`claude -p` may try to write to `~/.claude`, prompt for trust, or invoke tools. Binding for WS-A:
- Ensure a writable `HOME` in the Docker image; create `~/.claude` if needed.
- Run fully non-interactive: `claude -p "<prompt>" --output-format json --model "$MODEL"`. We need
  text-only generation — do not enable tools. If the installed CLI exposes flags to restrict tools
  or turns, prefer them; otherwise a pure text prompt won't trigger tools. Avoid any flag that
  could prompt.
- Parse the JSON envelope **defensively**: try `.result`, then the last assistant text, then raw
  stdout; unit-test against a captured sample (mock), since the CLI isn't auth'd in CI.
- If Tier-1 errors for ANY reason (missing token, non-zero exit, unparseable), fall through to
  Tier-2/3 silently. A synthesis failure must never fail the run.

**A4 — Cron vs long worker run: don't rely on "abort but keep running".**
Vercel functions are short-lived; `/run-due-topics` can take minutes. The original plan said
"abort the fetch after 8s and trust the worker to continue." That's fragile. **Binding:** WS-A
must make `/run-due-topics` return immediately (HTTP 202) using FastAPI `BackgroundTasks`, doing
the actual topic runs in the background. Then WS-B's cron just gets a fast 202 — no abort hacks.
- Scope: change ONLY `/run-due-topics` to background. **Leave `/run-topic` synchronous** (the
  manual "Search now" path in `api/listening/run.js` depends on its current response shape and the
  25s notify timeout). Don't touch `/run-topic`'s contract.
- WS-B: expect a fast 202 from `/run-due-topics`; still keep a sane fetch timeout (~15s) as
  defense, but it should rarely be hit now.

**A5 — Overlap guard (minor).** `is_due()` keys on `last_run_at`, not in-flight status. A manual
run + cron could double-run a topic. Low risk (single user). WS-A may optionally skip topics that
already have a `queued`/`running` run in the last ~30 min. Nice-to-have, not a blocker; the
existing `listening_hits` dedup makes a double-run merely wasteful, not corrupting.

## B. Developer-level findings (implementation)

**B1 — `.env.example` conflict (BLOCKER for parallel agents).** WS-A and WS-B both wanted to edit
root `.env.example` → merge conflict. **Binding:** NO sub-agent edits root `.env.example`. Each
agent instead lists its required env vars in its final report. The orchestrator patches
`.env.example` once after all agents finish. WS-A may still edit `worker/README.md`.

**B2 — `listening_briefs` schema must be read, not assumed.** Before writing new brief fields
(e.g. `top_pick`), WS-A must read the actual schema from `supabase/` migrations (and/or the live
DB). Only insert columns that exist; put extras into an existing JSON/`metadata` column if present,
else drop them. The insert in `bridge.py` must stay valid.

**B3 — Structured-output robustness for Tier-2.** For the Anthropic API path (Tier-2), prefer
`output_config: {format: {type:"json_schema", schema:{...}}}` (Sonnet 4.6 supports structured
outputs) so the brief JSON is guaranteed valid. For Tier-1 CLI (no structured outputs), instruct
"respond with ONLY the JSON object" and parse defensively. Either way, parse failure → return
`None` → template fallback.

**B4 — Model params (claude-api skill compliance).** On 4.x models: adaptive thinking only, no
`budget_tokens`, no `temperature`/`top_p`. For the cheap synthesis, Sonnet 4.6 with
`output_config:{effort:"low"}` is appropriate. Use exact model id strings (`claude-sonnet-4-6`,
`claude-opus-4-8`) — no date suffixes.

**B5 — PWA icon generation fallback.** WS-C: if no rasterizer (Pillow/sharp) is available to make
`icon-192.png`/`icon-512.png`, write and run a tiny generator; if truly blocked, commit minimal
valid PNGs or keep the SVG icon entry (`sizes:"any"`) as the installable icon and note PNGs as a
follow-up. Don't block the whole workstream on icon tooling.

**B6 — Keep imports working.** `bridge.py` keeps `from synthesize import create_brief` (template
fallback) AND adds `from synthesize_llm import create_brief_llm`. Don't delete the template.

**B7 — No deploy/commit/push.** Agents make local working-tree changes only. The orchestrator
summarizes; the user reviews, commits, and deploys (deploying is an outward-facing step requiring
the user — especially adding `CLAUDE_CODE_OAUTH_TOKEN`/`CRON_SECRET` to Railway/Vercel).

## C. Net plan after review (what each agent actually does)

- **WS-A (worker):** retrieval-as-fetch-only (`--plan`, free sources, `--quick`, no deep-research
  on schedule); `create_brief_llm` with 3-tier subscription→API→template billing; make
  `/run-due-topics` return 202 via BackgroundTasks; Dockerfile gets Node + claude CLI; tests +
  `worker/README.md` env docs. Reports env vars to add (no root `.env.example` edit).
- **WS-B (automation):** `api/cron/listening.js` (authed) → fast 202 from `/run-due-topics`;
  `vercel.json` crons. Reports `CRON_SECRET` for `.env.example` (no edit).
- **WS-C (capture):** PWA icons + manifest maskable; verify/fix share→/api/import field names;
  fix YouTube (oEmbed), empty-summary guard, IG entity-decode; tests.
- **WS-D (settings):** remove fake Telegram UI; add PWA install/share guidance; lint-clean.

## D. Post-review correction (2026-06-24) — planner is LLM-on-subscription, not skipped

Original WS-A skipped last30days' LLM planner entirely and passed a *deterministic* `--plan`.
Reviewing the engine source disproved the assumption that "runs without a paid key" == "retrieves
as well": `lib/planner.py` paraphrases, strips intent-modifiers, ORs keywords, and quotes proper
nouns specifically to avoid the documented near-zero-results failure (echoing the literal topic).
The deterministic plan reproduces that failure (`search_query = "AI video creation AI video
creation"`). The engine authors also state the host LLM *should* generate the plan and pass it via
`--plan` ("the deterministic fallback is the headless/cron path only").

**Fix implemented:** `worker/planner_llm.py::build_query_plan_llm` generates the plan via the same
subscription-billed `llm_client` chain (CLI/OAuth → API → None), mirroring the engine's planner
prompt contract; `bridge.run_last30days` uses it and falls back to `build_query_plan` (deterministic)
only when no provider is configured. So planning keeps its intelligence, still costs **$0 in API
credits** (subscription quota), and `--plan` still skips the engine's own paid planner. Tests:
`worker/tests/test_planner.py` (7, mocked). Net cost per run is now **2 small subscription calls**
(plan + synthesis), still ~$0 API.

## E. No fallbacks (2026-06-24) — listening hard-requires a Claude provider

Per user decision: the deterministic-plan fallback AND the template-brief fallback are **removed**.
A silently-degraded plan returns near-zero results and a templated brief is the fake intelligence
we set out to replace — laundering a broken run into fake output is worse than failing. So:
- `worker/bridge.run_last30days` raises if `planner_llm.build_query_plan_llm` returns `None`.
- `worker/bridge.sync_report_to_supabase` raises if `create_brief_llm` returns `None`.
- Both messages distinguish "no provider configured" (set `CLAUDE_CODE_OAUTH_TOKEN` or
  `ANTHROPIC_API_KEY`) from "provider configured but call failed" (check logs/quota).
- `worker/synthesize.py` (template) and `bridge.build_query_plan` (deterministic) are deleted.
- Failures surface in `listening_runs.error_message` → shown in the app's Topics view, and the
  manual "Search now" path returns the message to the UI.

Cost-efficiency answer for the user (carry into the final summary): retrieval is free/heuristic
across free sources, the engine's planner LLM is skipped via `--plan`, deep-research stays
manual-only, and the single intelligent step is one subscription-billed Claude call per run —
so a scheduled multi-source listening run costs ~$0 in API terms and a trivial slice of
subscription quota.
