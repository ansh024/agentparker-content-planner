from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client

from bridge import run_last30days, sync_report_to_supabase, utc_now

_here = Path(__file__).parent
load_dotenv(_here / ".env")           # worker-local overrides (optional)
load_dotenv(_here.parent / ".env")    # project root (OPENROUTER_API_KEY etc.)

app = FastAPI(title="ContentPlanner Listening Worker")


class RunTopicRequest(BaseModel):
    topic_id: str
    run_id: Optional[str] = None
    user_id: Optional[str] = None
    deep: bool = False
    # API keys the user stored in Settings — override env vars for this run
    config: Optional[dict] = None


def require_secret(x_worker_secret: Optional[str]) -> None:
    expected = os.environ.get("WORKER_SHARED_SECRET")
    if expected and x_worker_secret != expected:
        raise HTTPException(status_code=401, detail="Invalid worker secret")


def supabase_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(url, key)


def fetch_topic(client: Any, topic_id: str, user_id: Optional[str] = None) -> dict[str, Any]:
    query = client.table("listening_topics").select("*").eq("id", topic_id).limit(1)
    if user_id:
        query = query.eq("user_id", user_id)
    result = query.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Topic not found")
    return result.data[0]


def create_or_start_run(client: Any, topic: dict[str, Any], run_id: Optional[str]) -> str:
    if run_id:
        client.table("listening_runs").update({
            "status": "running",
            "started_at": utc_now(),
            "error_message": None,
        }).eq("id", run_id).execute()
        return run_id

    result = client.table("listening_runs").insert({
        "topic_id": topic["id"],
        "user_id": topic["user_id"],
        "status": "running",
        "started_at": utc_now(),
    }).execute()
    return result.data[0]["id"]


def fail_run(client: Any, run_id: str, message: str) -> None:
    client.table("listening_runs").update({
        "status": "failed",
        "finished_at": utc_now(),
        "error_message": message[:2000],
    }).eq("id", run_id).execute()


def is_due(topic: dict[str, Any]) -> bool:
    if not topic.get("active", True):
        return False
    last_run_at = topic.get("last_run_at")
    if not last_run_at:
        return True
    try:
        last_run = datetime.fromisoformat(last_run_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    interval = timedelta(days=7 if topic.get("frequency") == "weekly" else 1)
    return datetime.now(timezone.utc) - last_run >= interval


@app.get("/health")
def health():
    return {"ok": True, "service": "listening-worker"}


@app.post("/run-topic")
def run_topic(payload: RunTopicRequest, x_worker_secret: Optional[str] = Header(default=None)):
    require_secret(x_worker_secret)
    client = supabase_client()
    topic = fetch_topic(client, payload.topic_id, payload.user_id)
    run_id = create_or_start_run(client, topic, payload.run_id)

    try:
        # Apply user-supplied API keys for this run (overrides env without mutating globally)
        run_env_overrides = {k: v for k, v in (payload.config or {}).items() if v}
        report, raw_path = run_last30days(topic, deep=payload.deep, env_overrides=run_env_overrides)
        stats = sync_report_to_supabase(client, topic, run_id, report, raw_path)
        return {"ok": True, "run_id": run_id, **stats}
    except Exception as exc:
        fail_run(client, run_id, str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


def process_due_topics() -> None:
    """Run all due topics. Executed in the background so the HTTP caller (cron)
    gets a fast 202 instead of waiting minutes (REVIEW.md A4)."""
    client = supabase_client()
    result = client.table("listening_topics").select("*").eq("active", True).execute()
    topics = [topic for topic in result.data or [] if is_due(topic)]
    for topic in topics:
        run_id = create_or_start_run(client, topic, None)
        try:
            report, raw_path = run_last30days(topic, deep=False)
            sync_report_to_supabase(client, topic, run_id, report, raw_path)
        except Exception as exc:
            fail_run(client, run_id, str(exc))


@app.post("/run-due-topics", status_code=202)
def run_due_topics(
    background_tasks: BackgroundTasks,
    x_worker_secret: Optional[str] = Header(default=None),
):
    require_secret(x_worker_secret)
    # Validate config eagerly so a misconfigured worker fails fast (and the cron
    # sees the error) rather than failing silently in the background.
    supabase_client()
    background_tasks.add_task(process_due_topics)
    return JSONResponse(status_code=202, content={"ok": True, "status": "accepted"})
