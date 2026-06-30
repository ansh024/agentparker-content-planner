import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { getPlaybook } from "../_platforms.js";
import { logger } from "../_logger.js";

const log = logger("repurpose-batch");

// POST /api/repurpose/batch  body: { idea_ids: [...], platforms: [...] }
// Creates one content_drafts row per idea×platform (status 'generating') and
// returns them. The CLIENT then fans out /api/drafts/[id]/generate-one per draft
// (same Vercel-safe pattern as single repurpose — no server-side async loop).
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const body = await req.json();
  const ideaIds = (Array.isArray(body.idea_ids) ? body.idea_ids : []).slice(0, 25);
  const platforms = (Array.isArray(body.platforms) ? body.platforms : [])
    .map((p) => String(p).toLowerCase())
    .filter((p) => getPlaybook(p)?.enabled);
  if (ideaIds.length === 0 || platforms.length === 0) {
    return res.json({ error: "Pick at least one idea and one available platform." }, 400);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Only the user's own ideas (guards against foreign ids in the body).
  const { data: ideas } = await supabase
    .from("ideas").select("id").eq("user_id", userId).in("id", ideaIds);
  const validIds = (ideas || []).map((i) => i.id);
  if (validIds.length === 0) return res.json({ error: "No matching ideas found." }, 404);

  const rows = [];
  for (const ideaId of validIds) {
    for (const platform of platforms) {
      rows.push({
        user_id: userId,
        idea_id: ideaId,
        platform,
        format: getPlaybook(platform).formats[0],
        status: "generating",
      });
    }
  }

  const { data: drafts, error } = await supabase.from("content_drafts").insert(rows).select();
  if (error) {
    log.error("Batch draft creation failed", { error: error.message });
    return res.json({ error: "Could not start batch repurposing." }, 500);
  }
  return res.json({ drafts }, 201);
}
