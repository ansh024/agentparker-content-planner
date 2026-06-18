import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeHtmlEntities,
  extractInstagramMatch,
  extractInstagramPageData,
  normalizeInstagramUrl,
  readSharedCaption,
  stripUrlFromText,
} from "./_helpers.js";

test("decodeHtmlEntities handles numeric and named entities", () => {
  assert.equal(
    decodeHtmlEntities("WORLD CUP &#x1f3c6; &quot;test&quot; &#064;name &#x2019;s"),
    'WORLD CUP 🏆 "test" @name ’s',
  );
});

test("readSharedCaption removes URLs from Android share text", () => {
  const text = "A useful caption here https://www.instagram.com/reel/ABC123/?igsh=1";
  assert.equal(readSharedCaption(text, "", "https://www.instagram.com/reel/ABC123/"), "A useful caption here");
});

test("normalizeInstagramUrl drops tracking params", () => {
  assert.equal(
    normalizeInstagramUrl("https://www.instagram.com/reel/ABC123/?igsh=abc&utm_source=foo"),
    "https://www.instagram.com/reel/ABC123/",
  );
});

test("extractInstagramMatch returns kind and shortcode", () => {
  assert.deepEqual(extractInstagramMatch("https://www.instagram.com/p/CODE123/"), {
    kind: "p",
    shortcode: "CODE123",
  });
});

test("extractInstagramPageData prefers shared caption and parses og media", () => {
  const html = `
    <html>
      <head>
        <link rel="canonical" href="https://www.instagram.com/reel/ABC123/" />
        <meta property="og:title" content="evolving.ai on Instagram: \\"hello\\"" />
        <meta property="og:description" content="Fallback description" />
        <meta property="og:image" content="https://cdn.example.com/preview.jpg" />
        <meta property="og:video" content="https://cdn.example.com/reel.mp4" />
      </head>
    </html>
  `;
  const parsed = extractInstagramPageData(
    html,
    "https://www.instagram.com/reel/ABC123/?igsh=1",
    "",
    "Shared caption line https://www.instagram.com/reel/ABC123/?igsh=1",
  );

  assert.equal(parsed.canonicalUrl, "https://www.instagram.com/reel/ABC123/");
  assert.equal(parsed.caption, "Shared caption line");
  assert.equal(parsed.thumbnailUrl, "https://cdn.example.com/preview.jpg");
  assert.equal(parsed.videoUrl, "https://cdn.example.com/reel.mp4");
  assert.equal(parsed.mediaType, "reel");
});

test("stripUrlFromText removes first url and normalizes whitespace", () => {
  assert.equal(
    stripUrlFromText("Line one\n\nhttps://example.com/x\n  Line two", "https://example.com/x"),
    "Line one\n\nLine two",
  );
});
