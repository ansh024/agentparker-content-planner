import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectPlatform, resolveSharePayload } from "./shareTarget.js";

describe("resolveSharePayload", () => {
  it("uses explicit url and title params when present", () => {
    const payload = resolveSharePayload(new URLSearchParams("url=https%3A%2F%2Fyoutu.be%2Fabc&title=Video"));

    assert.deepEqual(payload, {
      url: "https://youtu.be/abc",
      title: "Video",
    });
  });

  it("falls back to the first URL in text", () => {
    const payload = resolveSharePayload(new URLSearchParams("text=Watch%20https%3A%2F%2Fexample.com%2Fpost%20later"));

    assert.deepEqual(payload, {
      url: "https://example.com/post",
      title: "",
    });
  });
});

describe("detectPlatform", () => {
  it("detects supported social platforms", () => {
    assert.equal(detectPlatform("https://instagram.com/p/1"), "instagram");
    assert.equal(detectPlatform("https://youtube.com/watch?v=1"), "youtube");
    assert.equal(detectPlatform("https://youtu.be/1"), "youtube");
    assert.equal(detectPlatform("https://x.com/user/status/1"), "twitter");
    assert.equal(detectPlatform("https://reddit.com/r/test"), "reddit");
    assert.equal(detectPlatform("https://tiktok.com/@user/video/1"), "tiktok");
  });

  it("defaults unknown links to web", () => {
    assert.equal(detectPlatform("https://example.com/article"), "web");
  });
});
