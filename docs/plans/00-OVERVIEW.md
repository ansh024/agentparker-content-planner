# ContentPlanner — Upgrade Plan (Overview)

> Planning doc. Authoritative for the work in this batch. Written 2026-06-24.
> Goal: make ContentPlanner actually deliver "90% of the work after 10% daily input"
> by (1) producing real AI research briefs, (2) running listening automatically,
> (3) doing it cost-efficiently, (4) billing AI to the Claude **subscription** (not API
> credits), and (5) making PWA share-to-app the capture path (Telegram is dropped).

## Why (evidence)

Audited the live app + production DB (2026-06-24):
- Listening "briefs" are a Python template (`worker/synthesize.py::create_brief`) — angles
  are raw source titles, hooks are a fixed f-string. No real intelligence. **This is the
  core value and it is fake.**
- Nothing runs on a schedule. Topics say "daily" but the newest `listening_run` is 2026-06-17.
  The worker has `/run-due-topics` + `is_due()` but no cron calls it.
- Capture: Telegram is dropped (PWA model). PWA `share_target` exists but is unverified and
  PWA icons are missing (not installable cleanly).
- YouTube enrichment is broken (empty `og:title`/description → useless "I don't see the
  content" AI summary). Instagram titles store raw HTML entities.

## Decisions (made on the user's behalf — see `REVIEW.md` for the stress-test)

1. **Subscription billing for the expensive AI (listening synthesis).** Use the Claude
   Agent SDK / `claude` CLI in headless mode, authenticated with `CLAUDE_CODE_OAUTH_TOKEN`
   (from `claude setup-token`). This draws from the user's Claude Pro/Max **subscription
   quota**, not per-token API credits. The worker (Railway, long-running container) is the
   only place this can run — Vercel serverless can't host the CLI/agent loop.
2. **Cost model — push LLM cost out of retrieval, into one synthesis call.**
   - last30days uses a reasoning LLM for *planning + reranking + synthesis* when run headless.
   - We pass a **pre-built `--plan`** (deterministic, from the topic's keywords) → skips the
     internal planner LLM entirely.
   - We let last30days do **free heuristic retrieval + ranking** (engagement scores) across
     **free sources** (reddit, hackernews, github, youtube/grounding). ScrapeCreators sources
     (tiktok/instagram/threads) are added only when a topic's `platform_focus` asks for them
     and a key exists (10K free calls/mo).
   - We **never** use `--deep-research` on scheduled runs (~$0.90/query via OpenRouter). It
     stays wired only to the manual "Deep run" button.
   - The single intelligent step — turning ranked candidates into a creator brief — is **one
     subscription-billed Claude call per run**. That's the whole AI cost of a scheduled run.
3. **Synthesis model = `claude-sonnet-4-6` (configurable via `LISTENING_SYNTH_MODEL`).**
   The user's explicit priority is cost/quota efficiency; brief synthesis is well within
   Sonnet. Override to `claude-opus-4-8` by env if desired.
4. **Two providers, NO degraded fallback** (updated 2026-06-24 — see REVIEW.md §E).
   Planning and synthesis each try (a) `claude` CLI + `CLAUDE_CODE_OAUTH_TOKEN`
   (subscription), then (b) `ANTHROPIC_API_KEY` via the `anthropic` SDK. If both
   are absent/failing the run **fails loudly** — there is no deterministic plan and
   no template brief (a keyword-echo plan returns near-zero results and a templated
   brief is the fake output we replaced). `worker/synthesize.py` and
   `bridge.build_query_plan` were deleted.
5. **Automation = Vercel Cron → `/api/cron/listening` → worker `/run-due-topics`.** Keeps the
   scheduler in the repo we control; the worker already filters due topics by frequency.
6. **Capture = PWA share target.** Remove the fake Telegram UI; add install/share guidance and
   the missing PWA icons; fix YouTube/empty-summary/IG-title enrichment bugs so shared links
   enrich correctly.

## Cost summary (per scheduled topic run, after this work)

| Component | Cost |
|---|---|
| Source retrieval (reddit/HN/github/youtube) | Free (public endpoints / grounding) |
| Web supplement (Brave) | Free tier |
| TikTok/IG/Threads (optional) | Free up to 10K SC calls/mo |
| Query planning | **1 Claude call on subscription quota** (smart plan → `--plan`; skips engine's *paid* planner). No API $ |
| last30days rerank | Heuristic (engagement) — no paid LLM |
| Brief synthesis | **1 Claude call on subscription quota** (no API $) |
| Vercel cron | Free (Hobby: daily cron) |

## Workstreams (parallelizable by directory — see per-file plans)

- **WS-A — Worker: real AI synthesis + cost-efficient retrieval.** `worker/` only.
  → `docs/plans/01-worker-synthesis-and-cost.md`
- **WS-B — Automation: Vercel cron.** `api/cron/`, `vercel.json`, `.env.example`.
  → `docs/plans/02-automation-cron.md`
- **WS-C — Capture: PWA share-target + enrichment fixes.** `api/import/`, `app/public/`,
  `app/src/lib/shareTarget.js`, `app/src/pages/SharePage.jsx`.
  → `docs/plans/03-capture-pwa-and-enrichment.md`
- **WS-D — Settings cleanup (drop Telegram, add PWA guidance).** `app/src/pages/SettingsPage.jsx`.
  → `docs/plans/04-settings-cleanup.md`

File ownership is partitioned so the four workstreams can run as parallel sub-agents with no
merge conflicts. WS-A owns all of `worker/`; WS-B owns cron + vercel.json; WS-C owns capture
files; WS-D owns SettingsPage only.

## Out of scope (deliberately, this batch)

- Deploying / pushing / committing — leave the working tree changed; the user reviews & ships.
- Moving idea **enrichment** (capture-time Haiku summary) to subscription billing — it's cheap,
  low-volume, and on Vercel where the Agent SDK can't run. Left on Haiku API; documented as a
  later flip. We still fix its correctness bugs.
- Email/push digest — depends on an email provider + new secrets; deferred.
