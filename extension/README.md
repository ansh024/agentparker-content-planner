# ContentPlanner Assistant (Chrome extension)

A Manifest V3 extension that adds a **realtime LinkedIn comment assistant** and
**quick-capture** on top of ContentPlanner. Draft-only by design — it copies
comments to your clipboard; you paste and post yourself. No auto-posting, zero
ToS automation risk (see `docs/plans/scaling-hub/03-chrome-extension.md`).

## What it does
- On any LinkedIn post, adds a **✦ Comment** button. Click it → the post text +
  author are scraped and sent to your ContentPlanner API, which returns 2–3
  thoughtful, on-voice comment options grounded in your knowledgebase. Copy the
  one you like.
- Clicking the toolbar icon opens a docked **side panel** (Chrome's Side Panel
  API) with connection status, **Save to Inbox** quick-capture, a manual
  **Draft a comment** generator, and connection settings — all in one persistent
  sidebar instead of a transient popup.

## Architecture
- `src/background.js` — service worker. **The only place the access token
  lives.** Content scripts/pages never see it; they message the worker, which
  attaches the `Bearer` header and calls the API.
- `src/content.js` + `src/selectors.js` — inject the button, scrape the post.
  All LinkedIn DOM selectors are in `selectors.js` (LinkedIn changes markup
  often — fix breakage there, with fallbacks).
- `src/sidepanel.*` — the docked side panel: connect your account (URL + token),
  quick-capture, and draft comments.

## Dev loop
1. Build the API + set env on the server:
   - Set `EXTENSION_ORIGIN=chrome-extension://<id>` in Vercel (you get `<id>`
     after step 3; reload the extension after setting it).
2. No bundler needed — this is plain MV3 (no build step). Edit files directly.
3. Load it:
   - `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
     select this `extension/` folder.
   - Copy the generated **extension ID**, set `EXTENSION_ORIGIN` to
     `chrome-extension://<id>` on the server, and redeploy/restart so CORS
     allows it.
4. Click the toolbar icon to open the **side panel** → expand **Connection
   settings** → paste your **ContentPlanner URL** and **access token** (from the
   web app → Settings → Connect extension).
5. After editing a file, hit the **reload** icon on the extension card.

## Security notes
- `/api/extension/*` endpoints pin CORS to `EXTENSION_ORIGIN` (no wildcard on
  credentialed routes — Eng review critical #3).
- The token is stored in `chrome.storage.local`, read only by the service
  worker. Content scripts cannot read it.

## Not in this MVP
- OAuth handshake (token is pasted for now).
- Post-composer assist, comment history, third-party-context enrichment — these
  are fast-follows once the comment loop proves out.
