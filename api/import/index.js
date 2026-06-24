import { createClient } from "@supabase/supabase-js";
import { w } from "../_w.js";
import { logger } from "../_logger.js";
import { deriveTitle, extractHandle, normalizeInstagramUrl, normalizeWhitespace, readSharedCaption } from "./_helpers.js";
import { importSource, mergeMetadata } from "./_enrich.js";

const log = logger("idea-import");

const VALID_STATUSES = new Set(["new", "planned", "drafting", "published", "archived"]);

export default async function handler(nodeReq, nodeRes) {
  const { req, res } = w(nodeReq, nodeRes);

  if (req.method === "OPTIONS") {
    res.setCors();
    return res.empty(204);
  }

  if (req.method !== "POST") {
    return res.json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return res.json({ error: "Please log in to continue." }, 401);
  }

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return res.json({ error: "Your session has expired. Please log in again." }, 401);
  }

  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json();
  const sourceUrl = normalizeSourceUrl(body.url || "");
  const platform = body.platform || detectPlatform(sourceUrl);
  const sharedTitle = normalizeWhitespace(body.shared_title || body.title || "");
  const sharedText = normalizeWhitespace(body.shared_text || body.text || "");
  const notes = normalizeWhitespace(body.notes || "");

  // User-supplied fields from the compose screen
  const userTitle = normalizeWhitespace(body.user_title || "");
  const userStatus = VALID_STATUSES.has(body.status) ? body.status : "new";
  const userTags = sanitizeTags(body.tags);
  const topicId = typeof body.topic_id === "string" && body.topic_id ? body.topic_id : null;
  const deferEnrichment = Boolean(body.defer_enrichment);

  if (!sourceUrl) {
    return res.json({ error: "Please provide a URL to import." }, 400);
  }

  const derivedTitle = deriveTitle({
    handle: extractHandle(sharedText, sharedTitle),
    caption: readSharedCaption(sharedText, sharedTitle, sourceUrl),
    fallback: sharedTitle,
  });

  // Track which user-supplied fields should be preserved through enrichment
  const userFields = {};
  if (userTitle) userFields.title = true;

  const initialMetadata = {
    import: {
      import_status: "importing",
      source_platform: platform,
      share_payload: {
        url: sourceUrl,
        title: sharedTitle,
        text: sharedText,
      },
      notes: notes || null,
      topic_id: topicId || null,
      user_fields: Object.keys(userFields).length ? userFields : null,
      started_at: new Date().toISOString(),
      warnings: [],
    },
  };

  const { data: createdIdea, error: insertError } = await serviceClient
    .from("ideas")
    .insert({
      user_id: user.id,
      source_url: sourceUrl,
      source_platform: platform,
      context_text: readSharedCaption(sharedText, sharedTitle, sourceUrl) || null,
      source_author: extractHandle(sharedText, sharedTitle) || null,
      title: userTitle || derivedTitle,
      status: userStatus,
      tags: userTags,
      metadata: initialMetadata,
    })
    .select()
    .single();

  if (insertError || !createdIdea) {
    log.error("Idea insert failed", insertError || {});
    return res.json({ error: "Couldn't create the import job." }, 500);
  }

  // Deferred path: return immediately and let the client trigger /enrich separately
  if (deferEnrichment) {
    return res.json({
      idea: createdIdea,
      import_status: "importing",
      warnings: [],
    }, 201);
  }

  // Inline enrichment (unchanged path — used by InboxPage manual add)
  try {
    const imported = await importSource({
      serviceClient,
      userId: user.id,
      ideaId: createdIdea.id,
      sourceUrl,
      platform,
      sharedTitle,
      sharedText,
      notes,
    });

    const mergedMetadata = mergeMetadata(createdIdea.metadata, imported.metadata);
    const updatePayload = {
      source_url: imported.canonicalUrl || createdIdea.source_url,
      source_platform: platform,
      source_author: imported.author || createdIdea.source_author,
      context_text: imported.caption || createdIdea.context_text,
      // Preserve user-supplied title; fall back to enrichment-derived title
      title: userTitle || imported.displayTitle || createdIdea.title,
      og_image_url: imported.previewUrl || createdIdea.og_image_url,
      ai_summary: imported.aiSummary || createdIdea.ai_summary,
      metadata: mergedMetadata,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedIdea, error: updateError } = await serviceClient
      .from("ideas")
      .update(updatePayload)
      .eq("id", createdIdea.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError || !updatedIdea) {
      throw updateError || new Error("Failed to save import result");
    }

    return res.json({
      idea: updatedIdea,
      import_status: mergedMetadata.import.import_status,
      warnings: mergedMetadata.import.warnings || [],
    }, 201);
  } catch (error) {
    log.error("Import failed", { ideaId: createdIdea.id, error: error.message });

    const failedMetadata = mergeMetadata(createdIdea.metadata, {
      import: {
        import_status: "import_failed",
        finished_at: new Date().toISOString(),
        error_message: error.message,
      },
    });

    const { data: failedIdea } = await serviceClient
      .from("ideas")
      .update({ metadata: failedMetadata, updated_at: new Date().toISOString() })
      .eq("id", createdIdea.id)
      .eq("user_id", user.id)
      .select()
      .single();

    return res.json({
      idea: failedIdea || createdIdea,
      import_status: "import_failed",
      error: "The link was saved, but the media import failed.",
    }, 201);
  }
}

function detectPlatform(url = "") {
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("tiktok.com")) return "tiktok";
  return "web";
}

function normalizeSourceUrl(input = "") {
  try {
    const url = new URL(input);
    url.hash = "";
    if (url.hostname.includes("instagram.com")) {
      return normalizeInstagramUrl(url.toString());
    }
    return url.toString();
  } catch {
    return "";
  }
}

function sanitizeTags(raw) {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  const cleaned = arr.map((t) => String(t).trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 50);
  return cleaned.length ? cleaned : null;
}
