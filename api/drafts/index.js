import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { getPlaybook } from "../_platforms.js";
import { logger } from "../_logger.js";

const log = logger("drafts-index");

// GET  /api/drafts?status=&platform=&idea_id=  → list drafts
// POST /api/drafts                              → net-new draft (not tied to an idea)
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    let query = supabase
      .from("content_drafts")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    for (const f of ["status", "platform", "idea_id"]) {
      const v = url.searchParams.get(f);
      if (v) query = query.eq(f, v);
    }
    const { data, error } = await query;
    if (error) return res.json({ error: "Could not load drafts." }, 500);
    return res.json({ drafts: data });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const platform = String(body.platform || "").toLowerCase();
    if (!getPlaybook(platform)?.enabled) {
      return res.json({ error: "Pick an available platform." }, 400);
    }
    if (!body.prompt?.trim()) return res.json({ error: "A prompt or topic is required." }, 400);

    const { data: draft, error } = await supabase
      .from("content_drafts")
      .insert({
        user_id: userId,
        platform,
        format: getPlaybook(platform).formats[0],
        status: "generating",
        ai_meta: { prompt: body.prompt.trim() },
      })
      .select()
      .single();
    if (error) {
      log.error("Net-new draft creation failed", { error: error.message });
      return res.json({ error: "Could not create draft." }, 500);
    }
    return res.json({ draft }, 201);
  }

  return res.json({ error: "Method not allowed" }, 405);
}
