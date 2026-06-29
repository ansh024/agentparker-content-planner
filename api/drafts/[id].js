import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { emitLearningEvent } from "../_learn.js";
import { logger } from "../_logger.js";

const log = logger("drafts-item");

// PATCH  /api/drafts/[id]  → save edits (emits an edit-diff learning event)
// DELETE /api/drafts/[id]  → remove a draft
export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const url = new URL(req.url, "http://localhost");
  const id = url.pathname.split("/").pop();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing } = await supabase
    .from("content_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return res.json({ error: "Draft not found." }, 404);

  if (req.method === "PATCH") {
    const body = await req.json();
    const patch = { updated_at: new Date().toISOString() };
    for (const f of ["title", "body", "structured", "status", "format"]) {
      if (f in body) patch[f] = body[f];
    }
    const bodyChanged = "body" in body && body.body !== existing.body;
    if (bodyChanged) {
      patch.version = (existing.version || 1) + 1;
      if (!("status" in body)) patch.status = "edited";
    }

    // Save the draft FIRST (commit), then emit the learning signal best-effort
    // (decoupled from the user's save path — M5 Honcho is never on this path).
    const { data: updated, error } = await supabase
      .from("content_drafts")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.json({ error: "Could not save changes." }, 500);

    if (bodyChanged) {
      emitLearningEvent(supabase, {
        userId,
        kind: "edit_diff",
        surface: "repurpose",
        platform: existing.platform,
        refType: "draft",
        refId: id,
        generatedText: existing.body,
        finalText: body.body,
      }).catch((e) => log.warn("learning event skipped", { error: e.message }));
    }

    return res.json({ draft: updated });
  }

  if (req.method === "DELETE") {
    const { error } = await supabase
      .from("content_drafts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return res.json({ error: "Could not delete this draft." }, 500);
    return res.empty(204);
  }

  return res.json({ error: "Method not allowed" }, 405);
}
