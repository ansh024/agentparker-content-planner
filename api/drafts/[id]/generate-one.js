import { createClient } from "@supabase/supabase-js";
import { w } from "../../_w.js";
import { requireUser } from "../../_auth.js";
import { generateDraftContent } from "../../_drafts.js";
import { logger } from "../../_logger.js";

const log = logger("generate-one");

// Generation can take several seconds (retrieval + LLM) — give headroom.
export const config = { maxDuration: 60 };

// POST /api/drafts/[id]/generate-one
// Generates content for ONE draft. The client calls this per draft (fan-out),
// so each generation is its own short-lived request.
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);
  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const url = new URL(req.url, "http://localhost");
  const draftId = url.pathname.split("/").slice(-2, -1)[0];

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: draft } = await supabase
    .from("content_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!draft) return res.json({ error: "Draft not found." }, 404);

  let idea = null;
  if (draft.idea_id) {
    const { data } = await supabase
      .from("ideas").select("*").eq("id", draft.idea_id).eq("user_id", userId).maybeSingle();
    idea = data;
  }

  try {
    const patch = await generateDraftContent(supabase, userId, draft, idea);
    const { data: updated, error } = await supabase
      .from("content_drafts")
      .update(patch)
      .eq("id", draftId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw error;
    return res.json({ draft: updated });
  } catch (err) {
    log.error("Draft generation failed", { draftId, error: err.message });
    await supabase
      .from("content_drafts")
      .update({ status: "failed", ai_meta: { ...(draft.ai_meta || {}), error: err.message }, updated_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("user_id", userId);
    return res.json({ error: "Generation failed. Try again." }, 500);
  }
}
