const URL_IN_TEXT = /https?:\/\/[^\s]+/i;
const INSTAGRAM_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(reel|p|tv)\/([^/?#]+)/i;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  copy: "(c)",
  reg: "(r)",
};

export function decodeHtmlEntities(input = "") {
  return String(input).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (!entity) return match;
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const value = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function normalizeWhitespace(input = "") {
  return decodeHtmlEntities(input)
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractUrl(input = "") {
  return String(input).match(URL_IN_TEXT)?.[0] || "";
}

export function stripUrlFromText(text = "", url = "") {
  const cleaned = String(text || "");
  if (!cleaned) return "";
  const withoutKnownUrl = cleaned.replace(/https?:\/\/[^\s]+/gi, " ");
  return normalizeWhitespace(url ? withoutKnownUrl.replace(url, " ") : withoutKnownUrl);
}

export function extractInstagramMatch(url = "") {
  const match = String(url).match(INSTAGRAM_URL_RE);
  if (!match) return null;
  return { kind: match[1].toLowerCase(), shortcode: match[2] };
}

export function normalizeInstagramUrl(url = "") {
  const match = extractInstagramMatch(url);
  if (!match) return url;
  return `https://www.instagram.com/${match.kind}/${match.shortcode}/`;
}

export function extractHandle(text = "", fallback = "") {
  const sources = [text, fallback].filter(Boolean);
  for (const source of sources) {
    const match = String(source).match(/@([a-z0-9._]{2,})/i);
    if (match) return `@${match[1]}`;
  }
  return "";
}

export function getMetaTag(html = "", key = "", attr = "property") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return decodeHtmlEntities(html.match(pattern)?.[1] || "");
}

export function getLinkHref(html = "", rel = "") {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<link[^>]+rel=["']${escaped}["'][^>]+href=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return decodeHtmlEntities(html.match(pattern)?.[1] || "");
}

export function parseJsonLd(html = "") {
  const matches = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed) return parsed;
    } catch {
      // Ignore invalid scripts.
    }
  }
  return null;
}

export function readSharedCaption(sharedText = "", sharedTitle = "", sourceUrl = "") {
  const caption = stripUrlFromText(sharedText, sourceUrl);
  if (caption) return caption;
  return normalizeWhitespace(sharedTitle);
}

export function deriveTitle({ handle = "", caption = "", fallback = "" }) {
  // normalizeWhitespace already decodes HTML entities, but decode again defensively
  // so a stored title never contains raw entities like &quot; or &#x1f3c6;.
  const source = decodeHtmlEntities(normalizeWhitespace(caption || fallback));
  if (!source && handle) return `${handle} post`;
  const firstSentence = source.split(/\n|(?<=[.!?])\s/)[0]?.trim() || source;
  const clipped = clampTitle(firstSentence);
  const full = handle ? `${handle}: ${clipped}` : clipped || "Imported idea";
  // Hard cap the final stored title to ~100 chars regardless of handle length.
  return full.length > 100 ? `${full.slice(0, 97).trim()}...` : full;
}

function clampTitle(text = "") {
  if (text.length <= 88) return text;
  return `${text.slice(0, 85).trim()}...`;
}

export function inferMediaType({ url = "", videoUrl = "", imageUrl = "" }) {
  if (videoUrl) return "reel";
  const match = extractInstagramMatch(url);
  if (match?.kind === "reel" || match?.kind === "tv") return "reel";
  if (imageUrl) return "image";
  return "link";
}

export function extractInstagramPageData(html = "", sourceUrl = "", sharedTitle = "", sharedText = "") {
  const jsonLd = parseJsonLd(html) || {};
  const canonicalUrl = getLinkHref(html, "canonical") || normalizeInstagramUrl(sourceUrl);
  const ogTitle = getMetaTag(html, "og:title");
  const ogDescription = getMetaTag(html, "og:description");
  const ogImage = getMetaTag(html, "og:image");
  const ogVideo = getMetaTag(html, "og:video") || getMetaTag(html, "og:video:secure_url");
  const title = decodeHtmlEntities(
    jsonLd.caption || jsonLd.headline || sharedTitle || ogTitle || "",
  );
  const caption = normalizeWhitespace(
    jsonLd.caption || readSharedCaption(sharedText, sharedTitle, sourceUrl) || ogDescription || title,
  );
  const author = extractHandle(
    sharedText,
    jsonLd.author?.alternateName || jsonLd.author?.name || ogTitle,
  );
  return {
    canonicalUrl,
    author,
    caption,
    title,
    thumbnailUrl: jsonLd.thumbnailUrl || ogImage || "",
    videoUrl: jsonLd.contentUrl || ogVideo || "",
    mediaType: inferMediaType({ url: canonicalUrl, videoUrl: jsonLd.contentUrl || ogVideo || "", imageUrl: jsonLd.thumbnailUrl || ogImage || "" }),
    jsonLd,
    meta: {
      ogTitle,
      ogDescription,
      ogImage,
      ogVideo,
    },
  };
}
