# Listening Worker

FastAPI service that runs `last30days-skill`, maps the JSON report into Supabase runs/clusters/hits/briefs, and powers the Listening page.

## Local Setup

Requires Python 3.12+ because `last30days-skill` v3 requires it.

```bash
cd worker
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Set these env vars:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WORKER_SHARED_SECRET=
LAST30DAYS_MEMORY_DIR=/data/last30days
```

### AI synthesis (the real creator brief)

Each run turns the heuristically-ranked last30days candidates into a genuine
creator brief via one Claude call. The provider chain degrades gracefully:

1. **Tier 1 — `claude` CLI on your subscription (preferred, no API $).**

   ```bash
   CLAUDE_CODE_OAUTH_TOKEN=   # run `claude setup-token` locally, paste into Railway
   ```

   This bills synthesis to your Claude Pro/Max **subscription quota** instead of
   API credits. The worker runs `claude -p ... --output-format json` headless
   (Node + the CLI are installed in the image). Notes:
   - It consumes subscription quota (subject to 5-hour / weekly windows). At ~a
     few synth calls/day this is negligible.
   - Tokens expire — regenerate with `claude setup-token`. When the token is
     missing/expired the worker falls through to Tier 2.
   - The token is never logged.
   - Used for BOTH query planning (`planner_llm`) and brief synthesis
     (`synthesize_llm`).

2. **Tier 2 — Anthropic API.**

   ```bash
   ANTHROPIC_API_KEY=   # used only if no OAuth token is set
   ```

There is **no Tier 3 / no template / no deterministic fallback.** If neither a
subscription token nor an API key is configured (or both fail), planning and
synthesis return `None` and the run **fails loudly** with an actionable error
(recorded in `listening_runs.error_message`, shown in the app's Topics view). A
keyword-echo plan returns near-zero results and a templated brief is the fake
output this system exists to replace — so we refuse to ship either.

Synthesis + planning model (applies to Tiers 1 and 2):

```bash
LISTENING_SYNTH_MODEL=claude-sonnet-4-6   # default; override to claude-opus-4-8 if desired
```

### Retrieval (cost-efficient, ~$0)

last30days is used as a retrieval + heuristic-ranking layer only. The worker
builds a deterministic `--plan` (so the engine skips its internal LLM planner)
and runs free sources with heuristic rerank — no paid reasoning provider is
needed on scheduled runs. `--deep-research` (paid, ~$0.90/query via OpenRouter)
is wired only to the manual "Deep run" button.

```bash
# Optional: persist engine findings to its SQLite store (off by default; we
# already dedupe via listening_hits).
LAST30DAYS_USE_STORE=false

# Optional: only needed for the manual Deep run path.
OPENROUTER_API_KEY=
```

Optional social sources (TikTok / Instagram / Threads) are added automatically
when `SCRAPECREATORS_API_KEY` is set **and** the topic's `platform_focus`
mentions them — no manual source list needed.

## Endpoints

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/run-topic \
  -H "content-type: application/json" \
  -H "x-worker-secret: $WORKER_SHARED_SECRET" \
  -d '{"topic_id":"<topic-id>","run_id":"<queued-run-id>"}'
```

`POST /run-due-topics` returns **HTTP 202 immediately** and processes active topics
whose `last_run_at` is past the topic frequency in the background (so the Vercel
cron caller gets a fast response). `POST /run-topic` stays synchronous.

## Railway Deploy

1. Create a Railway service from this repo.
2. Set root directory to `worker`.
3. Railway will use `worker/Dockerfile`.
4. Add the env vars from local setup.
5. Add a Railway cron job for daily research:

```bash
curl -X POST https://<worker-host>/run-due-topics \
  -H "x-worker-secret: $WORKER_SHARED_SECRET"
```

## Vercel Integration

Set these on the Vercel app:

```bash
LISTENING_WORKER_URL=https://<worker-host>
WORKER_SHARED_SECRET=<same-secret-as-railway>
```

The Vercel `/api/listening/run` endpoint creates a `listening_runs` row first, then calls `POST /run-topic` on this worker.
