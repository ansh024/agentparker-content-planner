import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { applyExtensionCors, isPreflight } from "../_cors.js";
import { logger } from "../_logger.js";

const log = logger("ext-capture");

// POST /api/extension/capture  body: { url, note?, title? }
// The MVP quick-capture slice — saves a page straight to the Inbox (no AI;
// the existing deferred-enrichment pipeline can pick it up like any idea).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  if (!applyExtensionCors(req, nodeRes)) return res.json({ error: "Forbidden origin." }, 403);
  if (isPreflight(req)) return res.empty(204);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const body = await req.json();
  const url = String(body.url || "").trim().slice(0, 2000);
  if (!url) return res.json({ error: "A URL is required." }, 400);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: idea, error } = await supabase
    .from("ideas")
    .insert({
      user_id: userId,
      source_url: url,
      source_platform: "extension",
      title: String(body.title || "").trim().slice(0, 300) || null,
      context_text: String(body.note || "").trim().slice(0, 4000) || null,
      status: "new",
    })
    .select()
    .single();
  if (error) {
    log.error("Extension capture failed", { error: error.message });
    return res.json({ error: "Could not save this." }, 500);
  }
  return res.json({ idea }, 201);
}
