import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { requireUser } from "../_auth.js";
import { embedDocumentChunks } from "../_kb.js";
import { logger } from "../_logger.js";

const log = logger("kb-item");

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  const auth = await requireUser(req);
  if (!auth.ok) return res.json({ error: auth.error }, auth.status);
  const userId = auth.user.id;

  const url = new URL(req.url, "http://localhost");
  const id = url.pathname.split("/").pop();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Ownership check (also guards DELETE/PATCH against cross-tenant ids).
  const { data: existing } = await supabase
    .from("kb_documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return res.json({ error: "Document not found." }, 404);

  if (req.method === "PATCH") {
    const body = await req.json();
    const patch = { updated_at: new Date().toISOString() };
    for (const f of ["title", "source_url", "platform"]) {
      if (f in body) patch[f] = body[f];
    }
    if ("tags" in body) patch.tags = Array.isArray(body.tags) ? body.tags : null;

    const bodyChanged = "body" in body && body.body !== existing.body;
    if (bodyChanged) {
      if (!body.body?.trim()) return res.json({ error: "Document body is required." }, 400);
      patch.body = body.body;
    }

    const { data: updated, error } = await supabase
      .from("kb_documents")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.json({ error: "Could not save changes." }, 500);

    // Re-embed only when the body actually changed (avoids needless cost).
    if (bodyChanged) {
      try {
        await embedDocumentChunks(supabase, userId, id, body.body);
      } catch (err) {
        log.error("Re-embed failed", { id, error: err.message });
        return res.json({ error: "Saved, but re-indexing failed. Try editing again." }, 500);
      }
    }
    return res.json({ document: updated });
  }

  if (req.method === "DELETE") {
    const { error } = await supabase
      .from("kb_documents")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return res.json({ error: "Could not delete this document." }, 500);
    return res.empty(204);
  }

  return res.json({ error: "Method not allowed" }, 405);
}
