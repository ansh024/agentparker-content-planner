# Sub-plan 03 — Chrome Extension: Realtime Content Assistant (M4)

**Goal:** a browser extension that helps you engage in real time — primarily **thoughtful,
on-voice LinkedIn comments** on a post you click, plus quick-capture and post-composition
assist. **Draft-only** (it never auto-posts; per your decision it puts text on your clipboard
/ into the box for you to send).

> Depends on M1 (KB + voice) and M3 (learning) for comment *quality*. A thin capture-only
> slice can ship anytime (see "MVP slice").

---

## Primary flow: the LinkedIn comment assistant

```
You click a post  →  content script reads post + author context  →  POST /api/extension/comment
        ▲                                                                     │
        │                                                                     ▼
   you pick / edit / copy   ◄── 2–3 comment options in YOUR voice ◄── server: KB retrieval
                                                                       + voice brief (Honcho)
                                                                       + writer context
                                                                       + platform=comment playbook
```

1. **Trigger** — on `linkedin.com/feed` & post pages, the content script injects a small
   "✦ Comment" button on each post (and a keyboard shortcut). You click the post you care about.
2. **Context extraction** — content script scrapes: post text, author name + headline, post
   type, and (if cheap) the author's recent post topics. *Selectors live in one config file*
   (`extension/src/selectors.js`) because LinkedIn markup changes often.
3. **Generate** — `POST /api/extension/comment` with `{post_text, author, author_headline,
   url}` + Bearer token. Server:
   - `retrieveContext()` over your KB for relevant expertise/takes/stories on the post topic,
   - `voiceBrief()` so it sounds like you,
   - **writer context** so the comment is relevant *to that person* (their headline/topic;
     in M3, a Honcho peer for the author accumulates notes across encounters),
   - a `comment` playbook: *add a real perspective, a specific insight, or a respectful
     counterpoint — never "Great post! 👏". 1–3 sentences. Sound like a peer, not a fan.*
4. **Choose** — popup/inline card shows 2–3 distinct options (e.g. "add insight",
   "share a story", "thoughtful counter"). You pick → edit → **copy** (or it fills the comment
   box for you to press Enter). Draft-only: you always send it yourself.
5. **Learn** — your pick + any edit → a `learning_event` (sub-plan 04). Comments are a huge,
   high-frequency voice signal.

**Why this is non-generic (your core requirement):** the comment is conditioned on *your*
knowledgebase + *your* voice + *that writer's* context + *that post's* content — four inputs a
generic "AI comment" button never has.

---

## Secondary flows

- **Quick-capture** — "Save to ContentPlanner" on any page/post → hits existing `/api/import`
  (this is the **MVP slice**: no AI, ships independently, immediate value, mirrors the PWA
  share target on desktop).
- **Post-compose assist** — on the LinkedIn "start a post" box, a "✦ Draft" affordance pulls a
  draft from your KB/voice (reuses the repurpose engine's `linkedin` playbook).
- *(Later)* YouTube: assist on comment replies + community posts using the `youtube` playbook.

---

## Architecture

- **`extension/`** — new MV3 package in the monorepo (own `package.json`, own build; document
  the dev loop in DevEx notes).
  - `manifest.json` (MV3): `content_scripts` for `*.linkedin.com`, `action` popup, minimal host
    permissions, `storage`.
  - `content/` — DOM read + button injection + box-fill (no auto-submit).
  - `background/` (service worker) — API calls, token handling.
  - `popup/` — login (Supabase auth) + settings + comment-options card.
  - `selectors.js` — all LinkedIn selectors in one place (resilience).
- **Auth** — popup runs Supabase auth; store the session; background sends `Bearer` token to
  `/api/extension/*`. Reuses the exact token-validation the existing endpoints already do.
- **New API** — `/api/extension/comment`, `/api/extension/draft`. Same auth + `_ai.js` context
  builders as the web app. Add CORS for the extension origin.
- **No new posting permissions** — draft-only means we never need write scopes or posting APIs.

---

## MVP slice (ship in parallel, no M1/M3 dependency)

A capture-only extension: toolbar button → save current tab to inbox via `/api/import`. This
delivers value on day one and de-risks the MV3 build/auth/CORS plumbing before the AI comment
flow lands.

---

## Acceptance criteria

- [ ] MV3 extension loads; popup logs in via Supabase; token reaches the API.
- [ ] Quick-capture saves the current page to the inbox (MVP slice).
- [ ] Clicking a LinkedIn post returns 2–3 comment options that are specific, on-voice, and
      reference the post/author — not generic praise.
- [ ] Picking/editing a comment copies it / fills the box (never auto-sends) and logs a
      `learning_event`.
- [ ] Selectors isolated to one file; graceful "couldn't read this post" fallback.
- [ ] Post-compose assist drafts a LinkedIn post from KB/voice.

## Risks
- **LinkedIn DOM churn** → centralized selectors + telemetry when extraction fails.
- **MV3 auth/CORS** → de-risk via MVP slice first.
- **Comment quality before M3** → ship after M1+M3, or label early version "beta" and lean on
  KB grounding until the learning loop matures.
- **Don't drift toward auto-engagement** → stays draft-only by design; you approve every send.
