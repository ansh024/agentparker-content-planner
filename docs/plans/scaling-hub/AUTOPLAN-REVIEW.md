# /autoplan Review — Scaling Hub plan set

Ran 2026-06-30 on `docs/plans/scaling-hub/*` (branch `master`, commit `27cb8a6`).
Mode: **SELECTIVE EXPANSION**. Gauntlet: CEO → Design → Eng → DX, each with dual voices.
**Codex unavailable** (not installed) → every phase ran `[subagent-only]`: an independent
Claude reviewer paired with the orchestrator's primary section review. Restore point:
`~/.gstack/projects/ansh024-agentparker-content-planner/master-autoplan-restore-20260630-023447.md`.

---

## Cross-phase themes (flagged independently in 2+ phases → high-confidence signal)

1. **Numbering inconsistency** — file order (`03-chrome-extension`=M4, `04-learning-honcho`=M3)
   doesn't match milestone order. Flagged by **Design, Eng, AND DX**. Mechanical fix.
2. **Async generation is fictional on Vercel** — flagged by **Eng (critical)** + **Design**
   (partial-tab states) + **CEO** (sequencing/scale). The single biggest buildability gap.
3. **Honcho is over-trusted and mis-sequenced** — **CEO** (will starve on sparse solo data;
   defer), **Eng** (third-party PII; don't put on the hot path), **DX** (no version pin,
   SDK surface unknown). Three phases, three angles.
4. **Interaction/error states + error contracts unspecified** — **Design** (loading/empty/
   error/partial on the 3 hot surfaces) + **DX** (problem/cause/fix error envelopes) + **Eng**
   (degraded-path tests absent).
5. **The moat is invisible/commoditized** — **CEO** (portable; a system prompt ≈ 80%) +
   **Design** (grounding transparency + learning never surfaced in UI).

---

## Phase 1 — CEO Review (Strategy & Scope)

### Premise challenge (the ONE gate that is NOT auto-decided — see Final Gate)
The plan rests on premises that were set via the prior office-hours Q&A but never *validated*:
- **P-A (binding constraint):** the bottleneck is *production friction*, not reach, topic-market
  fit, or judgment of what to post. **Unvalidated.** The plan instruments "light-edit ship
  rate" (proves voice-match) but no *business-outcome* metric (proves volume → reach/inbound).
- **P-B (personal tool vs product):** schema/RLS say personal tool; "moat/defensible/
  competitive" language says product. These are different builds. **Ambiguous.**
- **P-C (voice is the moat):** the raw asset is the user's own portable posts; ChatGPT/Claude
  Projects + a prompt reach ~80% at zero build. The genuinely *owned* differentiator is the
  existing **capture → listening → draft pipeline**, which the plan buries.

### What already exists (leverage map)
| Sub-problem | Existing code that already solves part of it |
|---|---|
| AI generation + OpenAI→Anthropic fallback | `api/ideas/[id]/ai.js` (brief/hooks/script) — extend, don't fork |
| Deferred/async enrichment pattern | `api/import/_enrich.js` + client second-call + Realtime |
| Per-user RLS + service-role pattern | `00001_initial_schema.sql` (all tables) |
| Capture corpus (proto-KB) | `ideas` + `ideas.metadata` JSONB |
| Calendar scheduling | `content_plans.target_platform` already exists |
| Trend/topic intelligence (the real wedge) | listening worker + `listening_*` tables |

### NOT in scope (deferred, with rationale)
- Instagram + Twitter/X playbooks — deferred to fast-follow (config-only once loop proven).
- Native posting APIs / auto-post — explicitly out (draft+copy decision).
- Multi-tenant productization (GTM, pricing, onboarding) — only if P-B resolves to "product".

### Dream-state delta (where this plan leaves us vs. the 12-month ideal)
12-month ideal: a daily brief that proposes today's posts + comments grounded in your owned
listening data, measurably in your voice, with proven outcome lift. This plan gets the
*production* half but leaves the *outcome-proof* and *owned-wedge* halves on the table.

### CEO consensus table
```
  Dimension                              Primary   Subagent  Consensus
  ─────────────────────────────────────  ────────  ────────  ─────────
  1. Premises valid?                      WEAK      WEAK      CONFIRMED (weak)
  2. Right problem to solve?              PARTIAL   PARTIAL   CONFIRMED (reframe wedge)
  3. Scope calibration correct?          NO        NO        CONFIRMED (cut + LinkedIn-first)
  4. Alternatives explored?              NO        NO        CONFIRMED (build-vs-buy missing)
  5. Competitive/market risks covered?   NO        NO        CONFIRMED (Taplio/AuthoredUp/etc.)
  6. 6-month trajectory sound?           AT RISK   AT RISK   CONFIRMED (Honcho starves)
  (Codex column = N/A, unavailable)
```
6/6 confirmed — strong agreement that the plan is architecturally competent but
strategically under-validated.

### Top CEO findings (→ User Challenges UC1–UC3 + premise gate)
- **[CRIT]** No business-outcome kill-gate (only edit-distance). → auto-add metric (P1).
- **[CRIT]** Personal-vs-product ambiguity. → premise gate.
- **[HIGH]** Learn-as-you-go starves M3; bootstrap should be mandatory, Honcho deferred. → **UC1**.
- **[HIGH]** YouTube mis-scoped as co-priority; LinkedIn-only M2. → **UC2**.
- **[HIGH]** Batch comment-at-volume is the most slop/ToS-exposed surface. → **UC3**.
- **[MED]** Reframe wedge around owned listening pipeline, not "voice". → auto-add to overview.

---

## Phase 2 — Design Review (UI scope detected)

### 7-dimension scorecard
| Pass | Score | Headline |
|---|---|---|
| 1 Information Architecture | 5/10 | No nav decision for 5 new surfaces; Voice buried in Settings contradicts thesis |
| 2 Interaction State Coverage | **3/10** | loading/empty/error/partial unspecified on Repurpose tabs, extension card, copy |
| 3 User Journey & Emotional Arc | 5/10 | Sequencing logic excellent; cold-start + onboarding-reveal + "learning felt" undesigned |
| 4 AI Slop Risk | 6/10 | Architected against slop well; but Ops dashboard generic, learning invisible |
| 5 Design System Alignment | 7/10 | Correctly reuses shadcn/PageHeader/Realtime; under-specified, not misaligned |
| 6 Responsive & Accessibility | **2/10** | Essentially absent — PWA/mobile, in-page card, streaming tabs, keyboard-copy |
| 7 Unresolved Decisions | 4/10 | Several explicit punts (nav home, Honcho surface) + implicit ones |

### Design consensus table
```
  Dimension                Primary   Subagent  Consensus
  ───────────────────────  ────────  ────────  ─────────
  Info hierarchy right?    NO        NO        CONFIRMED
  States specified?        NO        NO        CONFIRMED (critical)
  Journey coherent?        PARTIAL   PARTIAL   CONFIRMED (breaks at first-run/payoff)
  Specific vs generic?     MIXED     MIXED     CONFIRMED (Ops dashboard is generic)
  A11y/responsive?         NO        NO        CONFIRMED (biggest blind spot)
```

### Top Design findings (all auto-decided → P1/P2 tasks; completeness P1 + explicit P5)
- **[CRIT]** Specify Repurpose panel cold-start / zero-grounding / thin-idea states.
- **[CRIT]** Per-tab partial/error/timeout/retry states for async fan-out.
- **[HIGH]** Extension card loading/latency/degraded states + button injection design.
- **[HIGH]** Onboarding "here's what I learned about your voice" reveal moment.
- **[HIGH]** One IA decision: elevate "Today" + Voice out of ambiguity; Drafts top-level.
- **[MED]** Grounding-transparency chip ("grounded on: [Story][Take]"); copy ✓ confirmation;
  felt-learning acknowledgment; voice-wrong recovery / re-bootstrap path.

---

## Phase 3 — Eng Review

### Architecture (new components vs existing)
```
  Client/PWA + Extension(MV3)
        │  Bearer (token in service-worker only)
        ▼
  Vercel fns ── api/_ai.js (embed · retrieveContext · voiceBrief · buildContext)
   │  │  │        api/_platforms.js · api/_honcho.js · api/_learn.js
   │  │  └─► Supabase: pgvector(kb_documents, kb_chunks) · voice_profile ·
   │  │              content_drafts · learning_events · engagement_queue
   │  └─► async generation  ⚠ NO server-side continuation after res.json()
   ▼
  Railway worker (nightly voice refresh · queue drain · bulk embed)
        ▼
  Honcho (behavioral memory)  ⚠ never on the hot path; PII-scrubbed payload
```

### Three CRITICAL, buildability-blocking findings (auto-decided — must fix before M1 code)
- **[CRIT] Async execution model is fictional.** A Vercel fn is frozen after the response;
  "kick off generation, return" drops work. Fix: explicit model — **client fan-out** to a
  `/api/drafts/[id]/generate-one` per-platform endpoint (mirrors existing enrichment), OR a
  worker queue table the Railway worker drains. *(Which one = a surfaced taste decision.)*
- **[CRIT] `match_kb_chunks` RLS bypass.** Caller-supplied `match_user` + `SECURITY INVOKER`
  + service-role caller = cross-tenant read. Fix: derive userId from the validated Bearer
  token only; never from request body. Add assertion / `SECURITY DEFINER` keyed off `auth.uid()`.
- **[CRIT] Wildcard CORS on credentialed extension endpoints.** `Allow-Origin: *` +
  `Authorization` exposes authed endpoints to every site. Fix: pin `chrome-extension://<id>`
  (with a stable `manifest.json` `"key"`), keep the token in the service worker, treat the
  content script as untrusted.

### Failure Modes Registry (critical gaps)
```
  CODEPATH                  | FAILURE MODE             | RESCUED? | TEST? | USER SEES?      | GAP?
  --------------------------|--------------------------|----------|-------|----------------|-----
  POST /api/kb (embed)      | OPENAI key missing/429   | partial  | N     | 500 (unclear)  | YES
  repurpose fan-out         | fn timeout / dropped job | N        | N     | stuck skeleton | CRIT
  match_kb_chunks           | wrong match_user         | N        | N     | other's data   | CRIT
  /api/extension/comment    | LinkedIn DOM empty scrape| N        | N     | generic comment| CRIT
  /api/learn/event          | Honcho down              | claimed  | N     | nothing (ok)   | test it
  PATCH draft edit          | event insert couples save| N        | N     | failed save?   | YES
  /api/repurpose/batch      | 500 ids × 4 platforms    | N        | N     | cost blowout   | YES
```

### Eng consensus table
```
  Dimension                  Primary   Subagent  Consensus
  ─────────────────────────  ────────  ────────  ─────────
  Architecture sound?        PARTIAL   PARTIAL   CONFIRMED (separation good, execution broken)
  Test coverage sufficient?  NO        NO        CONFIRMED (degraded-path tests absent)
  Performance risks handled? NO        NO        CONFIRMED (embeddings/hnsw/hot-path)
  Security threats covered?  NO        NO        CONFIRMED (3 criticals)
  Error paths handled?       PARTIAL   PARTIAL   CONFIRMED (fallback designed, contracts not)
  Deployment risk OK?        PARTIAL   PARTIAL   CONFIRMED (migration manifest needed)
```

### Other Eng findings (auto-decided → tasks)
- Embedding staleness: `kb_chunks.embedding_status`, transactional chunk replacement, batch
  embed via worker, rate-limit bulk import.
- **`ivfflat`→`hnsw`** (better recall, incremental, no training; rebuild after bulk load).
- Honcho payload: enumerate fields, strip third-party PII, opt-in, DPA check.
- Input/cost caps: max body size, cap `idea_ids`/chunk counts, per-user rate limit (extend
  existing `_ratelimit.js`).
- Write ordering: commit draft first, emit `learning_event` async/best-effort, reconcile via
  `honcho_synced=false` sweep.

---

## Phase 3.5 — DX Review (developer-facing scope detected)

### DX scorecard (8 passes)
| Pass | Score | Headline |
|---|---|---|
| 1 Getting Started / TTHW | **3/10** | extension has no documented dev loop; new env vars not in `.env.example`/README |
| 2 API / SDK Design | 6/10 | mostly guessable; `lib/ai.js`↔`api/_ai.js` split; batch/learn namespace drift; no endpoint map |
| 3 Error Messages | **3/10** | great *degradation*, zero error *contracts* (problem/cause/fix) |
| 4 Docs | 4/10 | strong design docs, no copy-paste endpoint/module examples, README not updated |
| 5 Upgrade Path | 4/10 | own event-log escape hatch is great; no Honcho SDK pin, no migration manifest/rollback |
| 6 Dev Environment | 3/10 | monorepo extension build hand-waved; unstable dev ext ID + CORS footgun; no async local topology |
| 7 Community / Ecosystem | 5/10 | reasonable; Honcho immature dep, de-risked only by the wrapper |
| 8 DX Measurement | 3/10 | product metric excellent; no dev smoke tests / cold-start target |

**TTHW "run the extension locally": currently blocked (~2–4h reverse-engineering) → ~20 min
once the build loop + env + stable-ID/CORS are specified.**

### Top DX findings (auto-decided → tasks)
- Fix shared-module name now: standardize on `api/_ai.js`, `api/_platforms.js`,
  `api/_honcho.js`, `api/_learn.js` (matches existing `api/import/_*.js`). Update overview §7.
- Specify extension build/dev loop (recommend `@crxjs/vite-plugin` to reuse Vite/React/shadcn).
- Add `HONCHO_API_KEY`, `EMBEDDING_MODEL` to `.env.example` + README; add `extension/.env.example`;
  add a web/api/worker/extension env matrix.
- Pin Honcho SDK version; record verified surface in sub-plan 04.
- Shared error envelope `{error:{code,message,hint}}` with the named failure codes.
- Migration manifest (ordered, idempotent, with realtime publication adds + rollback notes).
- Consolidated endpoint map + one curl example per endpoint + a 5-line `buildContext()` usage.
- Per-milestone smoke sequence (e.g. M1: POST kb doc → GET search returns it).

---

## Decision Audit Trail (auto-decided via the 6 principles)

| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Add business-outcome metric (impressions/inbound) as kill-gate | Mechanical | P1 | Completeness — proves the actual thesis |
| 2 | CEO | Reframe wedge around owned listening pipeline in overview | Taste | P1 | The only non-commoditized asset |
| 3 | Design | Specify Repurpose cold-start/zero-grounding/thin-idea states | Mechanical | P1/P5 | Make-or-break first screen |
| 4 | Design | Specify per-tab partial/error/retry states | Mechanical | P1 | Partial failure is the common case |
| 5 | Design | Add onboarding voice-reveal moment | Mechanical | P1 | Where moat trust is won |
| 6 | Design | One IA decision: Today landing + Voice elevated + Drafts top-level | Taste | P5 | Resolve ambiguity now |
| 7 | Design | A11y/responsive pass across new surfaces | Mechanical | P1 | Currently 2/10 blind spot |
| 8 | Design | Grounding chip + copy ✓ + felt-learning + voice-recovery | Mechanical | P1 | Make the moat visible |
| 9 | Eng | Async exec model: client fan-out per-platform endpoint (default) | Taste | P3/P5 | Mirrors existing enrichment; simplest |
| 10 | Eng | `match_kb_chunks`: userId from Bearer token only | Mechanical | P5 | Security — clearly right |
| 11 | Eng | Pin extension CORS to `chrome-extension://<id>`; token in SW only | Mechanical | P5 | Security — clearly right |
| 12 | Eng | `hnsw` index; transactional re-embed; `embedding_status` | Mechanical | P3 | Correct retrieval = anti-slop |
| 13 | Eng | Honcho off hot path; PII-scrubbed, enumerated, opt-in payload | Mechanical | P1/P5 | Privacy + latency |
| 14 | Eng | Input/cost caps + per-user rate limit on write endpoints | Mechanical | P1 | DoS/cost vector |
| 15 | Eng | Commit draft first, emit learning_event async/best-effort | Mechanical | P5 | Decouple write path |
| 16 | DX | Standardize shared modules to `api/_*.js` | Mechanical | P4/P5 | DRY/explicit; matches repo |
| 17 | DX | Specify extension build loop (`@crxjs/vite-plugin`) | Mechanical | P5 | Unblocks M4 TTHW |
| 18 | DX | New env vars → `.env.example` + README + env matrix | Mechanical | P1 | Discoverability |
| 19 | DX | Pin Honcho SDK + record verified surface | Mechanical | P5 | Reproducibility |
| 20 | DX | Shared error envelope + migration manifest + endpoint map + curl examples | Mechanical | P1 | Completeness |
| 21 | All | Fix file/milestone numbering inconsistency | Mechanical | P5 | 3-phase consensus |

**Surfaced taste decisions** (auto-decided, override at gate): #2 (wedge reframing), #6 (IA
landing = Today), #9 (async = client fan-out).

---

## Implementation Tasks (aggregated, prioritized)

**P1 — blocks build / security (do first, mostly in M1 foundations):**
- [ ] T1 — Define async generation execution model (client fan-out → `/api/drafts/[id]/generate-one`); update sub-plans 02 + 05 + overview §7. *(Eng crit #1)*
- [ ] T2 — `match_kb_chunks`: derive `match_user` from Bearer token; never request body. *(Eng crit #2)*
- [ ] T3 — Pin extension CORS to `chrome-extension://<id>` + stable manifest `"key"`; token in service worker only. *(Eng crit #3)*
- [ ] T4 — Add business-outcome metric definition + instrumentation hook to sub-plan 04. *(CEO crit)*
- [ ] T5 — Standardize shared server modules to `api/_ai.js`/`_platforms.js`/`_honcho.js`/`_learn.js`; fix overview §7. *(DX F1)*
- [ ] T6 — Interaction-state matrix: Repurpose tabs + extension card + copy action (loading/empty/error/partial/retry/✓). *(Design crit #1,#2,#9)*
- [ ] T7 — Honcho off the hot path + enumerated PII-scrubbed opt-in payload. *(Eng #4,#9)*

**P2 — same-branch quality:**
- [ ] T8 — `hnsw` index + `embedding_status` + transactional re-embed + worker batch embed + bulk-import rate limit. *(Eng #5,#6)*
- [ ] T9 — Onboarding voice-reveal moment + voice-wrong/re-bootstrap recovery. *(Design #4,#10)*
- [ ] T10 — One IA decision (Today landing, Voice elevated, Drafts top-level) drawn in overview. *(Design #6)*
- [ ] T11 — Extension build/dev loop (`@crxjs/vite-plugin`) + env vars in `.env.example`/README + env matrix. *(DX F2,F3)*
- [ ] T12 — Shared error envelope `{error:{code,message,hint}}` with named failure codes. *(DX F5)*
- [ ] T13 — Input/cost caps + per-user rate limit on write endpoints (extend `_ratelimit.js`). *(Eng #8)*
- [ ] T14 — Migration manifest (ordered/idempotent/rollback + realtime adds). *(DX F6)*
- [ ] T15 — Grounding-transparency chip + copy ✓ confirmation + felt-learning ack. *(Design #5,#7,#8,#9)*

**P3 — follow-ups / TODOS:**
- [ ] T16 — A11y/responsive pass across all new surfaces. *(Design #6 dim)*
- [ ] T17 — Pin Honcho SDK + record verified surface in sub-plan 04. *(DX F4)*
- [ ] T18 — Consolidated endpoint map + curl examples + `buildContext()` snippet + per-milestone smoke. *(DX F7,F8,F10)*
- [ ] T19 — Normalize API namespaces (`/api/drafts/batch`, `/api/learn/events`). *(DX F7)*
- [ ] T20 — Fix file/milestone numbering. *(cross-phase)*

---

## Verdict
**Architecturally competent, strategically under-validated, not-yet-buildable as written.**
The two-memory separation and reuse of existing patterns are the right calls. Three Eng
criticals (async model, RLS bypass, CORS) must be resolved before any M1 code. Three strategic
choices (Honcho timing, YouTube co-priority, batch comments) are **User Challenges** — your
call, presented at the gate. Editing, error-state, and a11y specificity are the cheapest
high-impact quality wins.
