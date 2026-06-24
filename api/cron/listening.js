import { w } from "../_w.js";

/**
 * Daily scheduler endpoint. Vercel Cron hits this once a day (see vercel.json
 * `crons`) and it delegates to the worker's POST /run-due-topics, which selects
 * active topics where is_due(topic) is true and runs them.
 *
 * Per REVIEW A4, /run-due-topics now returns a fast HTTP 202 (the topic runs
 * happen in the worker's background tasks), so we just await it with a sane
 * ~15s timeout as defense and return its JSON. Never block on the full run.
 *
 * Auth: allow Vercel-issued cron (x-vercel-cron header present) OR a manual
 * trigger with `Authorization: Bearer ${CRON_SECRET}`. Otherwise 401.
 * Secrets are never echoed into the response body.
 */
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  // Vercel cron issues GET by default (with the cron header); allow manual POST too.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.json({ error: "Method not allowed" }, 405);
  }

  // Authorize the invocation.
  const isVercelCron = req.headers.get("x-vercel-cron") != null;
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  const hasValidBearer =
    Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidBearer) {
    return res.json({ error: "Unauthorized" }, 401);
  }

  const workerUrl = process.env.LISTENING_WORKER_URL;
  if (!workerUrl) {
    console.error("[cron/listening] LISTENING_WORKER_URL is not configured.");
    return res.json(
      { error: "Listening worker is not configured. Set LISTENING_WORKER_URL." },
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.LISTENING_CRON_TIMEOUT_MS || 15000),
  );

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/run-due-topics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": process.env.WORKER_SHARED_SECRET || "",
      },
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        `[cron/listening] Worker responded HTTP ${response.status}.`,
      );
      return res.json(
        {
          ok: false,
          dispatched: false,
          workerStatus: response.status,
          message: "Worker did not accept the due-topics run.",
        },
        502,
      );
    }

    console.log("[cron/listening] Dispatched due-topics run to worker.");
    return res.json({ ok: true, dispatched: true, worker: payload });
  } catch (error) {
    // A4: the worker returns a fast 202, so a timeout should be rare. If it
    // happens, the worker is still processing in the background — report success.
    if (error.name === "AbortError") {
      console.log(
        "[cron/listening] Worker request timed out; run continues server-side.",
      );
      return res.json({ ok: true, dispatched: true });
    }
    console.error(`[cron/listening] Failed to reach worker: ${error.message}`);
    return res.json(
      { ok: false, dispatched: false, message: "Could not reach the listening worker." },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
