import { createClient } from "@supabase/supabase-js";
import { w } from "../../_w.js";
import { logger } from "../../_logger.js";
import { normalizeWhitespace } from "../../import/_helpers.js";
import { importSource, mergeMetadata } from "../../import/_enrich.js";

const log = logger("idea-enrich");

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  if (req.method !== "POST") return res.json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return res.json({ error: "Please log in to continue." }, 401);

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await anonClient.auth.getUser(token);
  if (!user) return res.json({ error: "Session expired." }, 401);

  const url = new URL(req.url, "http://localhost");
  const ideaId = url.pathname.split("/").slice(-2, -1)[0];

  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: idea, error: fetchError } = await serviceClient
    .from("ideas")
    .select("*")
    .eq("id", ideaId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !idea) return res.json({ error: "Idea not found." }, 404);

  // Don't re-enrich an already-finished idea
  const currentStatus = idea.metadata?.import?.import_status;
  if (currentStatus === "ready") {
    return res.json({ idea, import_status: "ready" });
  }

  const sharePayload = idea.metadata?.import?.share_payload || {};
  const platform = idea.source_platform || "web";
  const sharedTitle = normalizeWhitespace(sharePayload.title || "");
  const sharedText = normalizeWhitespace(sharePayload.text || "");
  const notes = normalizeWhitespace(idea.metadata?.import?.notes || "");
  const userFields = idea.metadata?.import?.user_fields || {};

  log.info("Running deferred enrichment", { ideaId, platform });

  try {
    const imported = await importSource({
      serviceClient,
      userId: user.id,
      ideaId,
      sourceUrl: idea.source_url,
      platform,
      sharedTitle,
      sharedText,
      notes,
    });

    const mergedMetadata = mergeMetadata(idea.metadata, imported.metadata);
    const updatePayload = {
      source_url: imported.canonicalUrl || idea.source_url,
      source_author: imported.author || idea.source_author,
      context_text: imported.caption || idea.context_text,
      og_image_url: imported.previewUrl || idea.og_image_url,
      ai_summary: imported.aiSummary || idea.ai_summary,
      metadata: mergedMetadata,
      updated_at: new Date().toISOString(),
    };

    // Preserve user-supplied fields — never overwrite title if the user set one
    if (!userFields.title) {
      updatePayload.title = imported.displayTitle || idea.title;
    }

    const { data: updatedIdea, error: updateError } = await serviceClient
      .from("ideas")
      .update(updatePayload)
      .eq("id", ideaId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError || !updatedIdea) {
      throw updateError || new Error("Failed to save enrichment result");
    }

    return res.json({ idea: updatedIdea, import_status: mergedMetadata.import.import_status });
  } catch (error) {
    log.error("Deferred enrichment failed", { ideaId, error: error.message });

    const failedMetadata = mergeMetadata(idea.metadata, {
      import: {
        import_status: "import_failed",
        finished_at: new Date().toISOString(),
        error_message: error.message,
      },
    });

    await serviceClient
      .from("ideas")
      .update({ metadata: failedMetadata, updated_at: new Date().toISOString() })
      .eq("id", ideaId)
      .eq("user_id", user.id);

    return res.json({ error: "Enrichment failed.", import_status: "import_failed" }, 500);
  }
}
