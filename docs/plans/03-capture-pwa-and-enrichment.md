# WS-C — Capture: PWA Share-Target + Enrichment Bug Fixes

**Owner scope:** `api/import/` (and its `_helpers.js`), `app/public/` (icons, manifest),
`app/src/lib/shareTarget.js`, `app/src/pages/SharePage.jsx`. Do NOT touch `worker/`,
`vercel.json`, `api/cron/`, or `SettingsPage.jsx` (WS-D owns that).
**Goal:** Make PWA share-to-app the reliable, only capture path (Telegram is dropped), and fix the
enrichment bugs that make captured ideas low-quality.

## Part 1 — PWA installability (so "Add to Home Screen → Share" works)

The manifest references `/icon-192.png` and `/icon-512.png` but `app/public/` only has
`favicon.svg`, `manifest.json`, `sw.js`. Missing maskable icons hurt installability.

1. Generate `app/public/icon-192.png` and `app/public/icon-512.png` — simple brand icons
   (indigo `#4f46e5` rounded square with the white play-triangle mark from `LoginPage.jsx`, or a
   "P"). Use a tiny Node/Python script (Pillow or sharp) or commit pre-rendered PNGs. They must be
   real PNGs of the right dimensions. Add `"purpose": "any maskable"` to the icon entries in
   `manifest.json`.
2. Confirm `manifest.json` `share_target` is correct (it is: GET `/share` with title/text/url).
   Confirm `index.html` links the manifest and registers `sw.js`. If the service worker doesn't
   already handle the app shell, leave it — don't over-engineer; installability + share_target is
   the goal.

## Part 2 — Verify the share → save flow

- `SharePage.jsx` already: resolves payload, stashes a pending share + redirects to login if
  signed out, then on auth POSTs to `/api/import`. Read it fully and confirm:
  - It posts `{ url, shared_title, shared_text }` (or whatever `/api/import` expects — align field
    names with `api/import/index.js` body parsing: `url`, `shared_title|title`, `shared_text|text`,
    `notes`). Fix any field-name mismatch so shares actually enrich.
  - After save it navigates to the new idea / inbox and clears the pending share.
  - Handles the "no url" and "import_failed" states with a clear message.
- Keep `shareTarget.js` `resolveSharePayload` (extracts a URL from `text` when `url` is empty —
  important because Android often puts the URL in `text`). Good; keep it.

## Part 3 — Enrichment bug fixes (`api/import/index.js` + `api/import/_helpers.js`)

Three confirmed bugs (verified against real production rows):

1. **YouTube enrichment is broken.** Generic importer reads `og:title`/`og:description` from raw
   HTML, which YouTube doesn't serve reliably → title `" - YouTube"`, summary = "I don't see the
   content". Fix:
   - In `importGenericSource` (or a new `importYouTubeSource` branch), for youtube.com / youtu.be
     fetch **oEmbed**: `https://www.youtube.com/oembed?url=<URL>&format=json` → gives
     `title`, `author_name`, `thumbnail_url`. Use those for title / author / preview.
   - Use the oEmbed title (+ og:description if present) as the caption for the AI summary so the
     model has real content. (Transcript fetch is optional/out of scope — oEmbed title+author is
     enough to fix the garbage.)
2. **AI summary not guarded against empty input.** `summarizeImportedSource` is called even when
   title+caption are empty, producing a refusal-style "I'd be happy to help… but I don't see the
   content" string that gets saved. Fix: if there is no meaningful title AND no caption/description
   AND no transcript, **skip the LLM call** and leave `ai_summary` empty (or a neutral
   `"Saved from <platform> — open to view."`). Never store a refusal as the summary.
3. **Instagram title stores raw HTML entities.** Titles like `&quot;…&#x1f3c6;…` appear. Ensure
   `deriveTitle`/title path runs through `decodeHtmlEntities` and truncates to ~100 chars. Check
   `_helpers.js` `decodeHtmlEntities`/`deriveTitle` and apply consistently to the stored `title`.

Keep the enrichment LLM on the existing cheap path (Anthropic Haiku via `ANTHROPIC_API_KEY`) —
do NOT try to wire the Agent SDK here (Vercel can't host it). Just fix correctness.

## Verification
- `node --check api/import/index.js` and `_helpers.js`.
- Add/extend a test under `app/src/lib/*.test.mjs` or a small node script asserting:
  - `resolveSharePayload` pulls the URL out of `text` when `url` is empty.
  - A YouTube URL is detected and would use oEmbed (can mock fetch).
  - `decodeHtmlEntities` turns `&quot;`/`&#x1f3c6;` into real chars; title truncates.
- Manually trace: a shared `youtube.com/watch?v=...` → `/share` → `/api/import` → row has a real
  title + a non-refusal summary. (Document the trace; no need to hit prod.)
- Confirm PNG icons exist and are valid (`file app/public/icon-192.png`).

## Guardrails
- Don't change the `ideas` table schema. Work within existing columns + `metadata`.
- Don't break existing generic/instagram import paths while adding the YouTube branch.
- No secrets committed.
