# Listening Worker

Python FastAPI service that runs `last30days-skill` on a schedule and syncs results to Supabase.

## Setup

```bash
cd worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run locally

```bash
uvicorn main:app --reload --port 8000
```

## Trigger a run

```bash
curl -X POST http://localhost:8000/run
```

## Deploy

This is designed for Railway or fly.io. See `/docs/ARCHITECTURE.md` for deployment details.

## Structure

```
worker/
├── main.py              FastAPI app with cron endpoints
├── bridge.py            SQLite → Supabase sync logic
├── requirements.txt     Python dependencies
├── Dockerfile           Container definition
└── vendor/              Git submodules
    └── last30days-skill/
```
