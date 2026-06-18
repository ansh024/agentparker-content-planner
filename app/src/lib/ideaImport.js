export function getImportMeta(idea) {
  return idea?.metadata?.import || {};
}

export function getImportStatus(idea) {
  return getImportMeta(idea).import_status || "ready";
}

export function getImportWarnings(idea) {
  return getImportMeta(idea).warnings || [];
}

export function getIdeaNotes(idea) {
  return getImportMeta(idea).notes || "";
}

export function getIdeaMedia(idea) {
  const importMeta = getImportMeta(idea);
  const media = importMeta.storage_paths?.media || null;
  const preview = importMeta.storage_paths?.preview || null;
  return {
    type: importMeta.media_type || "link",
    mediaUrl: media?.publicUrl || "",
    mediaContentType: media?.contentType || "",
    previewUrl: preview?.publicUrl || idea?.og_image_url || "",
    transcript: importMeta.transcript_excerpt || "",
  };
}

export function isImportedVideo(idea) {
  const media = getIdeaMedia(idea);
  return media.mediaContentType.startsWith("video/") || media.type === "reel";
}
