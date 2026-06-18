const URL_IN_TEXT = /https?:\/\/[^\s]+/;

export function resolveSharePayload(params) {
  const rawUrl = params.get("url") || "";
  const rawText = params.get("text") || "";
  const rawTitle = params.get("title") || "";
  const urlMatch = rawText.match(URL_IN_TEXT);

  return {
    url: rawUrl || urlMatch?.[0] || "",
    title: rawTitle || "",
    text: rawText || "",
  };
}

export function detectPlatform(url) {
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("tiktok.com")) return "tiktok";
  return "web";
}
