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
OPENROUTER_API_KEY=
WORKER_SHARED_SECRET=
LAST30DAYS_MEMORY_DIR=/data/last30days
LAST30DAYS_SOURCES=reddit,hackernews,youtube,github,polymarket,grounding
```

Optional social sources need `SCRAPECREATORS_API_KEY`, then include `tiktok,instagram,threads,pinterest` in `LAST30DAYS_SOURCES`.

## Endpoints

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/run-topic \
  -H "content-type: application/json" \
  -H "x-worker-secret: $WORKER_SHARED_SECRET" \
  -d '{"topic_id":"<topic-id>","run_id":"<queued-run-id>"}'
```

`POST /run-due-topics` runs active topics whose `last_run_at` is past the topic frequency.

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
