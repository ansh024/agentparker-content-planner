import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { w } from "../_w.js";
import { logger } from "../_logger.js";
import { decodeHtmlEntities, deriveTitle, extractHandle, extractInstagramMatch, extractInstagramPageData, getMetaTag, normalizeInstagramUrl, normalizeWhitespace, readSharedCaption } from "./_helpers.js";

const log = logger("idea-import");
const IMPORT_BUCKET = "idea-imports";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_MEDIA_BYTES = 40 * 1024 * 1024;

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

  if (!sourceUrl) {
    return res.json({ error: "Please provide a URL to import." }, 400);
  }

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
      title: deriveTitle({
        handle: extractHandle(sharedText, sharedTitle),
        caption: readSharedCaption(sharedText, sharedTitle, sourceUrl),
        fallback: sharedTitle,
      }),
      status: "new",
      metadata: initialMetadata,
    })
    .select()
    .single();

  if (insertError || !createdIdea) {
    log.error("Idea insert failed", insertError || {});
    return res.json({ error: "Couldn't create the import job." }, 500);
  }

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
      title: imported.displayTitle || createdIdea.title,
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

function mergeMetadata(existing = {}, next = {}) {
  return deepMerge(existing || {}, next || {});
}

function deepMerge(left, right) {
  if (!isObject(left) || !isObject(right)) return right;
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (Array.isArray(value)) merged[key] = [...value];
    else if (isObject(value)) merged[key] = deepMerge(left[key] || {}, value);
    else merged[key] = value;
  }
  return merged;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// True only when text carries real content. Strips platform-suffix noise like
// " - YouTube" so an empty YouTube page title doesn't count as meaningful input.
function isMeaningfulText(value = "") {
  const cleaned = String(value || "")
    .replace(/\s*[-|–—]\s*(YouTube|Instagram|TikTok|X|Twitter|Reddit)\s*$/i, "")
    .trim();
  return cleaned.length >= 3;
}

async function importSource({ serviceClient, userId, ideaId, sourceUrl, platform, sharedTitle, sharedText, notes }) {
  if (platform === "instagram") {
    return importInstagramSource({ serviceClient, userId, ideaId, sourceUrl, sharedTitle, sharedText, notes });
  }
  if (platform === "youtube") {
    return importYouTubeSource({ serviceClient, userId, ideaId, sourceUrl, sharedTitle, sharedText, notes });
  }
  return importGenericSource({ serviceClient, userId, ideaId, sourceUrl, platform, sharedTitle, sharedText, notes });
}

async function importInstagramSource({ serviceClient, userId, ideaId, sourceUrl, sharedTitle, sharedText, notes }) {
  const warnings = [];
  const pageHtml = await fetchHtml(sourceUrl);
  const parsed = extractInstagramPageData(pageHtml, sourceUrl, sharedTitle, sharedText);
  const transcript = await fetchInstagramTranscript(sourceUrl, warnings);

  let media = null;
  let preview = null;

  if (parsed.videoUrl) {
    media = await uploadRemoteAsset({
      serviceClient,
      bucket: IMPORT_BUCKET,
      userId,
      ideaId,
      kind: "video",
      remoteUrl: parsed.videoUrl,
      fallbackContentType: "video/mp4",
    }).catch((error) => {
      warnings.push(`Video upload skipped: ${error.message}`);
      return null;
    });
  }

  const previewSource = parsed.thumbnailUrl || getMetaTag(pageHtml, "og:image");
  if (previewSource) {
    preview = await uploadRemoteAsset({
      serviceClient,
      bucket: IMPORT_BUCKET,
      userId,
      ideaId,
      kind: "preview",
      remoteUrl: previewSource,
      fallbackContentType: "image/jpeg",
    }).catch((error) => {
      warnings.push(`Preview upload skipped: ${error.message}`);
      return null;
    });
  }

  const caption = parsed.caption || readSharedCaption(sharedText, sharedTitle, sourceUrl);
  const author = parsed.author || extractHandle(sharedText, sharedTitle) || "";
  const aiSummary = await summarizeImportedSource({
    title: parsed.title,
    caption,
    author,
    mediaType: parsed.mediaType,
    transcript,
    platform: "instagram",
  }).catch(() => "");

  const importStatus = media || preview || caption ? "ready" : "import_failed";
  if (!media && parsed.mediaType === "reel") {
    warnings.push("Full reel video was not available from the source page. Stored the best available preview instead.");
  }

  return {
    canonicalUrl: parsed.canonicalUrl || sourceUrl,
    author,
    caption,
    displayTitle: deriveTitle({ handle: author, caption, fallback: parsed.title || sharedTitle }),
    previewUrl: preview?.publicUrl || parsed.thumbnailUrl || "",
    aiSummary,
    metadata: {
      import: {
        import_status: importStatus,
        finished_at: new Date().toISOString(),
        notes: notes || null,
        creator_handle: author || null,
        platform_post_id: extractInstagramMatch(parsed.canonicalUrl || sourceUrl)?.shortcode || null,
        media_type: parsed.mediaType,
        caption_source: caption === readSharedCaption(sharedText, sharedTitle, sourceUrl) ? "share_text" : "instagram_page",
        transcript_source: transcript ? "scrapecreators" : null,
        transcript_excerpt: transcript || null,
        storage_paths: {
          media: media || null,
          preview: preview || null,
        },
        raw_provider_payload: {
          canonical_url: parsed.canonicalUrl,
          meta: parsed.meta,
          json_ld: parsed.jsonLd,
        },
        warnings,
      },
    },
  };
}

async function fetchYouTubeOembed(sourceUrl) {
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", sourceUrl);
    url.searchParams.set("format", "json");
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: normalizeWhitespace(data.title || ""),
      author: normalizeWhitespace(data.author_name || ""),
      thumbnailUrl: data.thumbnail_url || "",
    };
  } catch {
    return null;
  }
}

async function importYouTubeSource({ serviceClient, userId, ideaId, sourceUrl, sharedTitle, sharedText, notes }) {
  const warnings = [];
  // oEmbed gives reliable title/author/thumbnail where YouTube's HTML og: tags don't.
  const oembed = await fetchYouTubeOembed(sourceUrl);
  if (!oembed) {
    warnings.push("YouTube oEmbed lookup failed; using shared text only.");
  }

  // og:description is still useful as extra caption context when available.
  let ogDescription = "";
  try {
    const pageHtml = await fetchHtml(sourceUrl);
    ogDescription = getMetaTag(pageHtml, "og:description");
  } catch (error) {
    warnings.push(`Page fetch skipped: ${error.message}`);
  }

  const title = oembed?.title || normalizeWhitespace(sharedTitle) || "";
  const author = oembed?.author || extractHandle(sharedText, sharedTitle) || "";
  const sharedCaption = readSharedCaption(sharedText, sharedTitle, sourceUrl);
  // Feed the AI real content: oEmbed title + og:description (+ any shared caption).
  const caption = normalizeWhitespace(
    [title, ogDescription, sharedCaption].filter(Boolean).join(" — "),
  );

  let preview = null;
  const previewSource = oembed?.thumbnailUrl || "";
  if (previewSource) {
    preview = await uploadRemoteAsset({
      serviceClient,
      bucket: IMPORT_BUCKET,
      userId,
      ideaId,
      kind: "preview",
      remoteUrl: previewSource,
      fallbackContentType: "image/jpeg",
    }).catch((error) => {
      warnings.push(`Preview upload skipped: ${error.message}`);
      return null;
    });
  }

  const aiSummary = await summarizeImportedSource({
    title,
    caption,
    author,
    mediaType: "video",
    platform: "youtube",
  }).catch(() => "");

  return {
    canonicalUrl: sourceUrl,
    author,
    caption,
    displayTitle: deriveTitle({ caption: title || caption, fallback: sharedTitle }),
    previewUrl: preview?.publicUrl || previewSource || "",
    aiSummary,
    metadata: {
      import: {
        import_status: "ready",
        finished_at: new Date().toISOString(),
        notes: notes || null,
        creator_handle: author || null,
        media_type: "video",
        caption_source: oembed ? "youtube_oembed" : "share_text",
        transcript_source: null,
        transcript_excerpt: null,
        storage_paths: {
          media: null,
          preview: preview || null,
        },
        raw_provider_payload: {
          oembed: oembed || null,
          meta: { og_description: ogDescription || null },
        },
        warnings,
      },
    },
  };
}

async function importGenericSource({ serviceClient, userId, ideaId, sourceUrl, platform, sharedTitle, sharedText, notes }) {
  const warnings = [];
  const pageHtml = await fetchHtml(sourceUrl);
  const title = getMetaTag(pageHtml, "og:title") || decodeHtmlEntities(pageHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || sharedTitle);
  const description = getMetaTag(pageHtml, "og:description") || readSharedCaption(sharedText, sharedTitle, sourceUrl);
  const previewSource = getMetaTag(pageHtml, "og:image");
  let preview = null;

  if (previewSource) {
    preview = await uploadRemoteAsset({
      serviceClient,
      bucket: IMPORT_BUCKET,
      userId,
      ideaId,
      kind: "preview",
      remoteUrl: previewSource,
      fallbackContentType: "image/jpeg",
    }).catch((error) => {
      warnings.push(`Preview upload skipped: ${error.message}`);
      return null;
    });
  }

  const aiSummary = await summarizeImportedSource({
    title,
    caption: description,
    author: "",
    mediaType: "link",
    platform,
  }).catch(() => "");

  return {
    canonicalUrl: sourceUrl,
    author: "",
    caption: description,
    displayTitle: deriveTitle({ caption: description, fallback: title || sharedTitle }),
    previewUrl: preview?.publicUrl || previewSource || "",
    aiSummary,
    metadata: {
      import: {
        import_status: "ready",
        finished_at: new Date().toISOString(),
        notes: notes || null,
        creator_handle: null,
        media_type: preview ? "image" : "link",
        caption_source: description === readSharedCaption(sharedText, sharedTitle, sourceUrl) ? "share_text" : "page_meta",
        transcript_source: null,
        transcript_excerpt: null,
        storage_paths: {
          media: null,
          preview: preview || null,
        },
        raw_provider_payload: {
          meta: {
            og_title: getMetaTag(pageHtml, "og:title"),
            og_description: getMetaTag(pageHtml, "og:description"),
            og_image: previewSource,
          },
        },
        warnings,
      },
    },
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`Source fetch failed with ${response.status}`);
  }
  return response.text();
}

async function uploadRemoteAsset({ serviceClient, bucket, userId, ideaId, kind, remoteUrl, fallbackContentType }) {
  const response = await fetch(remoteUrl, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "*/*",
      referer: "https://www.instagram.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`asset fetch failed with ${response.status}`);
  }

  const length = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (length && length > MAX_MEDIA_BYTES) {
    throw new Error(`asset too large (${Math.round(length / (1024 * 1024))} MB)`);
  }

  const contentType = response.headers.get("content-type") || fallbackContentType;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error(`asset too large (${Math.round(bytes.byteLength / (1024 * 1024))} MB)`);
  }

  const extension = guessExtension(contentType, remoteUrl);
  const path = `${userId}/${ideaId}/${kind}.${extension}`;
  const { error } = await serviceClient.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });

  if (error) {
    throw new Error(error.message || "storage upload failed");
  }

  const { data } = serviceClient.storage.from(bucket).getPublicUrl(path);
  return {
    path,
    publicUrl: data.publicUrl,
    contentType,
    bytes: bytes.byteLength,
  };
}

function guessExtension(contentType = "", remoteUrl = "") {
  if (contentType.includes("video/mp4")) return "mp4";
  if (contentType.includes("video/quicktime")) return "mov";
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/jpeg")) return "jpg";
  try {
    const urlPath = new URL(remoteUrl).pathname;
    const ext = urlPath.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch {
    // Ignore malformed asset URLs and fall back to content type defaults.
  }
  return contentType.startsWith("video/") ? "mp4" : "jpg";
}

async function fetchInstagramTranscript(sourceUrl, warnings) {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) return "";
  try {
    const url = new URL("https://api.scrapecreators.com/v2/instagram/media/transcript");
    url.searchParams.set("url", sourceUrl);
    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      warnings.push(`Transcript fetch returned ${response.status}.`);
      return "";
    }
    const data = await response.json();
    const transcripts = Array.isArray(data.transcripts) ? data.transcripts : [];
    return normalizeWhitespace(
      transcripts
        .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
        .filter(Boolean)
        .join(" "),
    );
  } catch (error) {
    warnings.push(`Transcript fetch failed: ${error.message}`);
    return "";
  }
}

async function summarizeImportedSource({ title, caption, author, mediaType, transcript, platform }) {
  // Guard: if there's no meaningful title AND no caption/description AND no transcript,
  // skip the LLM call entirely so we never store a refusal-style "I don't see the content"
  // summary. Return a neutral placeholder instead.
  const hasTitle = isMeaningfulText(title);
  const hasCaption = isMeaningfulText(caption);
  const hasTranscript = isMeaningfulText(transcript);
  if (!hasTitle && !hasCaption && !hasTranscript) {
    const label = platform || mediaType || "the web";
    return `Saved from ${label} — open to view.`;
  }

  const prompt = `You are helping a content creator organize inspiration.

Source author: ${author || "Unknown"}
Source type: ${mediaType}
Title: ${title || "Untitled"}
Caption or body:
${caption || "None"}
${transcript ? `Transcript excerpt:\n${transcript}\n` : ""}
Write a crisp 2 sentence summary explaining what this source is about and why it could matter for a creator.`;

  if (process.env.OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });
    return normalizeWhitespace(response.output_text || "");
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }],
    });
    return normalizeWhitespace(message.content?.[0]?.text || "");
  }

  return "";
}
