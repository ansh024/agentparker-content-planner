# WS-B — Automation: Daily Vercel Cron → Worker `/run-due-topics`

**Owner scope:** `api/cron/` (new), `vercel.json`, root `.env.example`. Do NOT touch `worker/` or
`app/`.
**Goal:** Make "daily" topics actually run daily without the user clicking anything.

## Context
- The worker already exposes `POST /run-due-topics` (header `x-worker-secret`) which selects
  active topics where `is_due(topic)` is true (frequency daily/weekly vs `last_run_at`) and runs
  them. We just need a scheduler to call it once a day.
- Existing API handlers use the `w(nodeReq,nodeRes)` wrapper (`api/_w.js`) — follow that pattern
  for consistency, or use a plain Vercel handler `export default function handler(req,res)`. Match
  the style in `api/listening/run.js`.
- Env already present in prod: `LISTENING_WORKER_URL`, `WORKER_SHARED_SECRET`.

## Steps

1. **New `api/cron/listening.js`:**
   - Accept POST/GET (Vercel cron issues GET by default with the cron header).
   - **Auth the invocation** so it can't be triggered by the public: allow if EITHER
     `req.headers['x-vercel-cron']` is present (Vercel-issued) OR
     `Authorization: Bearer ${process.env.CRON_SECRET}` matches. Otherwise 401.
   - Call the worker:
     ```js
     const res = await fetch(`${process.env.LISTENING_WORKER_URL.replace(/\/$/,'')}/run-due-topics`, {
       method: "POST",
       headers: { "Content-Type": "application/json",
                  "x-worker-secret": process.env.WORKER_SHARED_SECRET || "" },
     });
     ```
   - Use a generous timeout / fire-and-report: `/run-due-topics` runs all due topics synchronously
     and can take minutes. Vercel serverless functions have a max duration (Hobby ~10–60s). So:
     **do not block on the full run.** Kick the request and return quickly:
     - Set a short `AbortController` timeout (e.g. 8s). If it aborts, that's expected — the worker
       keeps running server-side. Return `{ ok: true, dispatched: true }`.
     - If it returns within the window, include the worker's JSON summary.
   - Log clearly. Never expose `WORKER_SHARED_SECRET`/`CRON_SECRET` in the response body.
   - If `LISTENING_WORKER_URL` is unset, return 503 with a clear message (don't crash).

2. **`vercel.json` — add crons:**
   ```json
   "crons": [
     { "path": "/api/cron/listening", "schedule": "0 13 * * *" }
   ]
   ```
   - 13:00 UTC daily. (Hobby plan supports daily cron granularity.) Keep existing `rewrites`
     intact — add the `crons` key alongside them; ensure `/api/cron/listening` is NOT swallowed by
     the SPA rewrite (the `/api/(.*)` rewrite already routes it correctly — verify ordering).

3. **`.env.example`:** add
   - `CRON_SECRET=generate-a-long-random-string` with a comment: "Used to manually trigger
     /api/cron/listening; Vercel cron is authed via the x-vercel-cron header automatically."

## Verification
- `node --check api/cron/listening.js`.
- Confirm `vercel.json` is valid JSON and the SPA catch-all rewrite still excludes `/api/*`.
- Document (in a comment or the PR notes) the manual test:
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/listening`.

## Guardrails
- The cron must be safe to run when no topics are due (worker returns ran:0). No side effects.
- Don't double-trigger: the worker's `is_due()` already prevents re-running a topic within its
  frequency window, so an accidental extra cron hit is a no-op. Good.
- Don't put the worker run inline in Vercel (it would time out) — always delegate to the worker.
