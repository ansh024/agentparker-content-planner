# Scaling Hub — Build Status & Handoff

**Last updated:** 2026-06-30. **Branch:** `master` (pushed to GitHub `main`).
This is the cross-machine handoff: what's built, what's pending, how to run it,
and the gotchas. Read alongside [00-overview.md](00-overview.md) (strategy) and
[AUTOPLAN-REVIEW.md](AUTOPLAN-REVIEW.md) (the formal review + task list).

Milestone build order (from the gate): **M1 → M2 → M3 → M4 → M5.**
File-number order (01,02,03,04,05) ≠ milestone order — the milestone is authoritative.

---

## ✅ Done (committed & pushed to `main`)

| Commit | Milestone | Summary |
|---|---|---|
| `093e10c` | **M1 — Knowledgebase + Voice** | pgvector RAG + voice profile + shared `api/_ai.js` |
| `89ac6ae` | **M2 — Repurposing engine** | 1 idea → LinkedIn drafts, client fan-out, `content_drafts` |
| `623aceb` | **M3 — Chrome extension** | LinkedIn comment assistant + quick-capture, pinned CORS |
| _(this batch)_ | **M4 — Scale & Ops** | Today dashboard, batch repurpose, fill-my-week, daily targets |

### M1 — Knowledgebase + Voice
- **Migration:** `supabase/migrations/20260630000000_knowledgebase_and_voice.sql`
  — `pgvector`, `kb_documents`, `kb_chunks` (vector(1536), **hnsw** index),
  `voice_profile`, `match_kb_chunks` RPC. RLS = per-user + service_role. All in
  `supabase_realtime`.
- **Shared modules:**
  - `api/_auth.js` — `requireUser(req)`: the single source of the authenticated
    user id (from Bearer token). **Eng-critical #2**: KB retrieval is always
    scoped to this id, never a request-body value.
  - `api/_ai.js` — `embed`, `chunkText`, `retrieveContext`, `voiceBrief`,
    `buildContext`, `generateJson` (OpenAI-primary / Anthropic-fallback). The
    one place generators get grounding.
  - `api/_kb.js` — `ingestDocument`, `embedDocumentChunks`, `KB_KINDS`.
- **API:** `GET/POST /api/kb`, `PATCH/DELETE /api/kb/[id]`, `POST /api/kb/promote`,
  `POST /api/kb/search`, `GET/PATCH /api/voice`, `POST /api/voice/bootstrap`.
- **Wired into idea AI:** `api/ideas/[id]/ai.js` now grounds brief/hooks/script
  via `buildContext()` (best-effort; degrades if embeddings unavailable).
- **UI:** `app/src/pages/KnowledgebasePage.jsx`, `VoicePage.jsx`,
  `app/src/lib/kb.js`. Nav + routes wired. "Save to KB" on Idea Detail.

### M2 — LinkedIn Repurposing Engine
- **Migration:** `supabase/migrations/20260630010000_content_drafts.sql` —
  `content_drafts` (per-platform, versioned), RLS + realtime.
- **Eng-critical #1 (the important one):** generation is **client-driven
  fan-out**, NOT server-side async-after-response (which is fictional on Vercel).
  `POST /api/ideas/[id]/repurpose` only creates one `generating` row per
  platform and returns ids; the client (`app/src/lib/drafts.js` →
  `repurposeIdea`) then calls `POST /api/drafts/[id]/generate-one` per draft in
  parallel and streams results in.
- **Playbooks:** `api/_platforms.js` — declarative; **LinkedIn `enabled`,
  YouTube present but `enabled:false`** (M2 = LinkedIn only per the gate). Adding
  a platform = flip `enabled` + a UI entry.
- **Generation:** `api/_drafts.js` builds prompt from `buildContext` + playbook,
  records `kb_docs_used`/`on_voice` in `ai_meta` (→ "✦ on-voice" chip).
- **API:** `repurpose`, `drafts/[id]/generate-one`, `GET/POST /api/drafts`,
  `PATCH/DELETE /api/drafts/[id]`, `drafts/[id]/schedule`.
- **Learning hook (forward-compat for M5):** `api/_learn.js` `emitLearningEvent`
  — `PATCH /api/drafts/[id]` emits an `edit_diff` event after the draft commits.
  It's a clean **no-op until the M5 `learning_events` table exists**, then starts
  persisting with zero caller changes.
- **UI:** `app/src/components/drafts/{DraftCard,RepurposePanel}.jsx`,
  `app/src/pages/DraftsPage.jsx`. RepurposePanel on Idea Detail.

### M3 — LinkedIn Comment Assistant (Chrome extension)
- **Backend:** `api/extension/comment.js` (2–3 on-voice, KB-grounded, anti-slop
  comment options), `api/extension/capture.js` (quick-capture → inbox).
- **Eng-critical #3:** `api/_cors.js` pins CORS to `EXTENSION_ORIGIN`
  (`chrome-extension://<id>`) — no wildcard on credentialed routes. Token lives
  ONLY in the extension service worker.
- **Extension (MV3, no build step):** `extension/` — `manifest.json`,
  `src/background.js` (token + API calls), `src/content.js` + `src/selectors.js`
  (button injection + scrape; all LinkedIn selectors isolated with fallbacks),
  `src/popup.*`. See `extension/README.md` for the dev loop.
- **Web app:** Settings → "Connect extension" copies the session token.

### M4 — Scale & Content Ops
- **Migration:** `supabase/migrations/20260630020000_scale_ops.sql` — adds
  `profiles.daily_targets jsonb`. The batch comment queue / `engagement_queue`
  was CUT at the gate and is deliberately NOT created.
- **API:** `GET /api/ops/today` (aggregated dashboard: triage, drafts to review,
  scheduled, listening angles, targets + posted-today progress),
  `POST /api/ops/targets`, `POST /api/repurpose/batch` (N ideas × platforms →
  draft rows; client fans out generate-one — same Vercel-safe pattern),
  `POST /api/plan/week` ("fill my week": proposes a balanced week from KB +
  listening + inbox, writes `content_plans`).
- **UI:** `app/src/pages/TodayPage.jsx` (new landing page; `*` and post-login go
  to `/today`), `app/src/components/ops/BatchRepurposeDialog.jsx`,
  `app/src/lib/ops.js`. "Today" added as first nav item.

### Review applied (no PR — direct diff review)
All 3 Eng-criticals verified implemented. 3 fixes applied during review:
(1) `buildContext` resolves retrieval + voice independently (voice survives if
embeddings are down); (2) `_learn.js` missing-table detection broadened
(`42P01` + `PGRST205` + message); (3) extension `tabs` permission added.

---

## ⏳ Pending

### Operational (must do before any of the above works in prod — code can't do these)
1. **Apply all three migrations** to Supabase:
   `20260630000000_knowledgebase_and_voice.sql`, `20260630010000_content_drafts.sql`,
   `20260630020000_scale_ops.sql`.
2. **Vercel env vars** (see `.env.example`):
   - `OPENAI_API_KEY` — **required** for embeddings (KB + grounding).
   - `EMBEDDING_MODEL` — defaults to `text-embedding-3-small` (must stay 1536-dim).
   - `EXTENSION_ORIGIN` — `chrome-extension://<id>` after loading the unpacked
     extension (get id at `chrome://extensions`). Comma-separate dev+prod ids.
   - `HONCHO_API_KEY` — already in Supabase secrets; copy to Vercel + worker for M5.
3. **Verify `match_kb_chunks` at runtime.** The RPC passes the embedding as a JS
   array (standard Supabase pgvector pattern) — confirm a real `POST /api/kb/search`
   returns hits once data exists. This is the one thing not verifiable without a live DB.

### Remaining milestones
- **M5 — Learning Layer / Honcho** ([04-learning-honcho.md](04-learning-honcho.md)):
  `learning_events` table, `api/_learn.js` Honcho wrapper, nightly `voice_profile`
  refresh, light-edit ship-rate metric. **A/B-gated; never on the generation hot
  path; PII-scrubbed payload.** The static `voice_profile` is the contract until
  Honcho beats it in a measured A/B.

### Known follow-ups / tech debt
- Idea AI does an embedding call on every brief/hooks/script run (grounding).
  Degrades gracefully but adds latency/cost on an existing path.
- Frontend bundle >500kB (pre-existing warning) — code-split later.
- Extension auth is paste-the-token (MVP); OAuth handshake is a fast-follow.
- YouTube/Instagram/Twitter playbooks: add as `api/_platforms.js` entries when
  the LinkedIn loop proves out (evidence-gated).

---

## How to run locally
- **Frontend:** `cd app && npm install && npm run dev` (root `npm run dev` prints this).
- **Build check:** `cd app && npm run build`.
- **API:** Vercel serverless functions in `api/` (Node, ESM). Each handler uses
  `w(nodeReq, nodeRes)` from `api/_w.js`. Syntax check: `node --check <file>`.
- **Extension:** load `extension/` unpacked at `chrome://extensions` (no bundler).

## Conventions (match these)
- Auth: `requireUser(req)` → `{ ok, user, status, error }`. Never trust body for user id.
- Service-role client for DB writes, always filtered by `user_id = <token id>`.
- New tables: per-user RLS + a `service_role` full-access policy; add to
  `supabase_realtime` if the UI reflects live progress.
- AI: extend `api/_ai.js`, don't fork the provider logic.
- Embedding-heavy handlers set `export const config = { maxDuration: 60 }`.
