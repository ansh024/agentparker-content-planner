import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";

async function currentUser(authHeader) {
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  return user;
}

async function notifyWorker({ runId, topicId, userId, deep }) {
  const workerUrl = process.env.LISTENING_WORKER_URL;
  if (!workerUrl) {
    return {
      queued: true,
      message: "Research run queued. Configure LISTENING_WORKER_URL to process it.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LISTENING_WORKER_NOTIFY_TIMEOUT_MS || 25000));
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/run-topic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.WORKER_SHARED_SECRET ? { "x-worker-secret": process.env.WORKER_SHARED_SECRET } : {}),
      },
      body: JSON.stringify({ run_id: runId, topic_id: topicId, user_id: userId, deep: Boolean(deep) }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        queued: true,
        workerError: payload.detail || payload.error || `Worker HTTP ${response.status}`,
        message: "Research run queued, but the worker did not start cleanly.",
      };
    }
    return {
      queued: false,
      worker: payload,
      message: payload.total_new_hits > 0
        ? `Research complete. Added ${payload.total_new_hits} new results.`
        : "Research complete. No new URLs, but sightings and briefs were updated.",
    };
  } catch (error) {
    return {
      queued: true,
      workerError: error.name === "AbortError" ? "Worker request timed out." : error.message,
      message: "Research run queued. The worker may still be processing it.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in to continue." }, 401);

  const user = await currentUser(authHeader);
  if (!user) return res.json({ error: "Session expired." }, 401);

  const body = await req.json();
  const { topicId, deep = false } = body;
  if (!topicId) return res.json({ error: "Topic ID required." }, 400);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: topic, error: topicError } = await supabase
    .from("listening_topics")
    .select("*")
    .eq("id", topicId)
    .eq("user_id", user.id)
    .single();

  if (topicError || !topic) return res.json({ error: "Topic not found." }, 404);

  const { data: run, error: runError } = await supabase
    .from("listening_runs")
    .insert({
      topic_id: topic.id,
      user_id: user.id,
      status: "queued",
      query_plan: {
        topic: topic.name,
        keywords: topic.keywords || [],
        audience: topic.audience,
        content_format: topic.content_format,
        competitors: topic.competitors || [],
        platform_focus: topic.platform_focus || [],
      },
    })
    .select()
    .single();

  if (runError) return res.json({ error: "Couldn't queue research run." }, 500);

  const workerResult = await notifyWorker({
    runId: run.id,
    topicId: topic.id,
    userId: user.id,
    deep,
  });

  return res.json({
    ok: true,
    run,
    runId: run.id,
    queued: workerResult.queued,
    workerError: workerResult.workerError,
    message: workerResult.message,
    worker: workerResult.worker,
  });
}
