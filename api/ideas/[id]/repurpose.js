import { createClient } from "@supabase/supabase-js";
import { w } from "../../_w.js";
import { requireUser } from "../../_auth.js";
import { getPlaybook } from "../../_platforms.js";
import { logger } from "../../_logger.js";

const log = logger("repurpose");

// POST /api/ideas/[id]/repurpose  body: { platforms: [...], format? }
// Creates one content_drafts row per platform in `generating` state and returns
// their ids. The CLIENT then fans out to /api/drafts/[id]/generate-one for each
// (Eng review critical #1 — no server-side async after the response).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const url = new URL(req.url, "http://localhost");
  const ideaId = url.pathname.split("/").slice(-2, -1)[0];
  const body = await req.json();
  const platforms = (Array.isArray(body.platforms) ? body.platforms : [])
    .map((p) => String(p).toLowerCase());

  const valid = platforms.filter((p) => getPlaybook(p)?.enabled);
  if (valid.length === 0) {
    return res.json({ error: "Pick at least one available platform." }, 400);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: idea } = await supabase
    .from("ideas")
    .select("id")
    .eq("id", ideaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!idea) return res.json({ error: "Idea not found." }, 404);

  const rows = valid.map((platform) => ({
    user_id: userId,
    idea_id: ideaId,
    platform,
    format: getPlaybook(platform).formats[0],
    status: "generating",
  }));

  const { data: drafts, error } = await supabase
    .from("content_drafts")
    .insert(rows)
    .select();
  if (error) {
    log.error("Draft row creation failed", { error: error.message });
    return res.json({ error: "Could not start repurposing." }, 500);
  }

  return res.json({ drafts }, 201);
}
