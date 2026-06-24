import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeHtmlEntities, deriveTitle } from "./_helpers.js";

describe("decodeHtmlEntities", () => {
  it("decodes named entities", () => {
    assert.equal(decodeHtmlEntities("&quot;hi&quot; &amp; bye"), '"hi" & bye');
  });

  it("decodes hex numeric entities (emoji)", () => {
    assert.equal(decodeHtmlEntities("win &#x1f3c6; today"), "win 🏆 today");
  });

  it("decodes decimal numeric entities", () => {
    assert.equal(decodeHtmlEntities("A&#38;B"), "A&B");
  });

  it("handles a typical Instagram title with mixed entities", () => {
    assert.equal(
      decodeHtmlEntities("&quot;Biggest win&#x1f3c6; of 2026&quot;"),
      '"Biggest win🏆 of 2026"',
    );
  });
});

describe("deriveTitle", () => {
  it("strips raw HTML entities from the stored title", () => {
    const title = deriveTitle({ caption: "&quot;Hello&#x1f3c6;&quot;", fallback: "" });
    assert.ok(!title.includes("&quot;"), "title should not contain raw &quot;");
    assert.ok(!title.includes("&#x"), "title should not contain raw numeric entity");
    assert.ok(title.includes("🏆"));
  });

  it("truncates long titles to ~100 chars with ellipsis", () => {
    const long = "word ".repeat(60).trim(); // ~300 chars, no sentence break
    const title = deriveTitle({ caption: long, fallback: "" });
    assert.ok(title.length <= 100, `expected <=100, got ${title.length}`);
    assert.ok(title.endsWith("..."));
  });

  it("hard-caps the final title even with a long handle", () => {
    const handle = "@" + "x".repeat(120);
    const title = deriveTitle({ handle, caption: "some caption here", fallback: "" });
    assert.ok(title.length <= 100, `expected <=100, got ${title.length}`);
  });
});
