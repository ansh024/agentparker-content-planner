# ContentPlanner → Personal Content & Network Scaling Hub

**Master strategy plan.** Planned 2026-06-30. **Status: REVIEWED & APPROVED** via `/autoplan`
(CEO→Design→Eng→DX gauntlet) on 2026-06-30 — see [AUTOPLAN-REVIEW.md](AUTOPLAN-REVIEW.md) for
the full findings, consensus tables, 21-item decision audit trail, and prioritized task list.
Gate decisions applied below: **personal hub** (not a product), **bootstrap-hard + defer Honcho**,
**LinkedIn-only M2**, **batch comment queue cut**.

> **Three Eng criticals must be resolved before any M1 code** (details in review): (1) the async
> generation model is fictional on Vercel — use client fan-out to a per-platform endpoint;
> (2) `match_kb_chunks` must derive userId from the Bearer token, never the request body;
> (3) extension CORS must pin `chrome-extension://<id>`, token stays in the service worker.

> Relationship to prior planning: `docs/plans/00-OVERVIEW.md` (2026-06-24) covers an
> in-flight batch — real listening briefs, automated cron, capture/enrichment fixes. This
> plan set is the **next, larger arc** and assumes that batch's foundations (working AI
> generation, durable capture) are in place or landing.

---

## 1. The thesis (the 10-star product)

Today ContentPlanner captures inspiration and listens to trends. The next version turns
it into **a second brain that helps you post like _you_ — at 5× the volume, without
offloading your judgment or your voice.**

The explicit non-goal — stated by you — is the thing most "AI content tools" get wrong:
**no generic slop, no 100% automation.** You stay in the loop. The product's job is to
remove the *friction* (blank page, platform reformatting, research, comment-drafting) so
you can do more of the *thinking* every day.

The genuinely differentiated asset here is **the owned capture → listening → draft pipeline**
(the `listening_*` engine you already run) feeding a voice-aware generator. Voice-match alone
is *not* a moat — it's commoditized (your own posts + a system prompt get ~80% of the way).
So this is framed honestly as **personal leverage**, not a defensible product: the value is
that it removes *your* daily friction over *your* trend data, in *your* voice. The learning
layer makes the *next* draft closer to how you'd actually write it; repurposing and the
extension are delivery surfaces for that.

> **Reviewed reframe (CEO gate):** dropped the "moat/competitive" framing — this is a personal
> hub. Success is measured by a **business-outcome metric (reach / inbound per post)** as the
> kill-gate, *alongside* edit-distance — proving volume actually moves the needle, not just that
> drafts sound like you.

> **Design principle that governs every sub-plan:** every interaction is *also* a training
> signal. Saving an idea, editing a draft, picking a comment, publishing a post — each one
> teaches the system your voice. The product gets more "you" the more you use it.

---

## 2. Locked decisions (from planning Q&A)

| Decision | Choice | Consequence |
|---|---|---|
| First milestone | **Knowledgebase + voice profile** | Foundation everything else reads from. |
| Posting automation | **Draft + 1-click copy only** | No posting APIs/auto-post. Zero ToS/approval risk. Fastest. You paste & post. |
| Voice data source | **Mandatory bootstrap import, then learn** *(revised at gate)* | Paste 5–10 best posts/platform in M1 (was "optional") — a solo creator's edit stream is too sparse to learn voice from scratch. |
| Priority platform | **LinkedIn only for M2** *(revised at gate)* | Prove the full loop where the tool's leverage is real (text); YouTube + IG + Twitter are evidence-gated fast-follows. |
| Learning backbone | **Static `voice_profile` is the contract; Honcho deferred & A/B-gated** *(revised at gate)* | Ship M2/M4 on the static profile; promote Honcho to the hot path only if it beats it in a measured A/B. pgvector handles factual retrieval regardless. |
| Engagement scope | **1-at-a-time comment assistant; no batch comment queue** *(revised at gate)* | Batch comments at volume = slop by construction + ToS-exposed; contradicts the no-slop thesis. |

---

## 3. The five pieces & how they fit

```
                 ┌──────────────────────────────────────────────┐
                 │            KNOWLEDGEBASE  (M1)                 │
                 │  Facts/expertise → pgvector RAG                │
                 │  Voice → voice_profile + samples              │
                 └───────────────┬──────────────────────────────┘
                                 │ grounds every generation
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                         ▼
┌───────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ REPURPOSING   │      │ CHROME EXTENSION │      │   SCALE / OPS     │
│ engine (M2)   │      │  (M4)            │      │   layer (M5)      │
│ 1 idea → N    │      │ LinkedIn comment │      │ batch generate,   │
│ platform      │      │ + capture +      │      │ comment queue,    │
│ drafts        │      │ post-assist      │      │ volume dashboard  │
└───────┬───────┘      └────────┬─────────┘      └─────────┬────────┘
        │                       │                          │
        └───────────────────────┴──────────────────────────┘
                                 │ every edit / publish / pick
                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │        LEARNING LAYER  (M3) — Honcho           │
                 │  observes behavior → refines voice_profile     │
                 │  raw event log in Postgres (replayable)        │
                 └──────────────────────────────────────────────┘
```

Two memory systems, deliberately **kept separate** (conflating them is the classic mistake):

- **Factual / explicit memory** → *what you know & believe.* Expertise, takes, frameworks,
  stories, swipe files, past posts. Stored as documents, chunked, embedded in **pgvector**,
  retrieved by semantic similarity to *ground* a generation. (Sub-plan 01.)
- **Behavioral / voice memory** → *how you write & think.* Tone, rhythm, formatting habits,
  what you accept vs. reject. Derived by **Honcho** from observed behavior, plus a
  structured `voice_profile` we maintain. (Sub-plan 04.)

A generation prompt = `idea/context` + `retrieved KB facts (pgvector)` +
`voice brief (voice_profile + Honcho)` + `platform playbook`.

---

## 4. Sub-plans

> File numbers are stable doc IDs; the **Milestone** column is the authoritative build order
> (revised at gate). Read in milestone order: 01 → 02 → 03 → 05 → 04.

| Doc | Plan | Milestone | One-liner |
|---|---|---|---|
| 01 | [Knowledgebase + Voice Profile](01-knowledgebase-voice.md) | **M1** | pgvector RAG over your expertise + a bootstrap-seeded voice profile. |
| 02 | [Multi-platform Repurposing Engine](02-repurposing-engine.md) | **M2** | One idea → platform-native drafts (**LinkedIn only** to start). |
| 03 | [Chrome Extension — Realtime Assistant](03-chrome-extension.md) | **M3** | Click a LinkedIn post → a thoughtful, on-voice comment (1-at-a-time); capture & compose assist. |
| 05 | [Scale & Content Ops](05-scale-ops.md) | **M4** | Batch repurpose, "fill my week", volume dashboard — the "do more daily" payoff (no comment queue). |
| 04 | [Learning Layer (Honcho)](04-learning-honcho.md) | **M5** | A/B-gated upgrade: every action teaches the system your voice, *if* it beats the static profile. |

---

## 5. Sequencing & rationale

```
M1  KB + Voice (+ bootstrap import)  ──►  M2  Repurposing (LinkedIn only)  ──►  M3  Extension (1-at-a-time)  ──►  M4  Scale/Ops  ──►  M5  Learning (Honcho, A/B-gated)
        (foundation)                          (first payoff)                       (daily driver)                  (volume)            (optional upgrade)
```

> **Sequencing revised at gate.** Honcho moved from M3 → last and made conditional (it needs a
> real edit/publish stream to learn from, and must beat the static `voice_profile` in an A/B
> before touching the hot path). The extension moves up (it adds daily value once M1+M2 exist).
> YouTube playbook is deferred out of M2. Batch comment queue removed from the scale layer.

- **M1 first** — your choice, and correct: without grounding + voice, every other feature
  produces the slop you explicitly want to avoid.
- **M2 second** — first *visible* payoff and it immediately exercises M1. Editing drafts here
  generates the richest training signal for M3.
- **M3 third** — once there's a stream of edits/publishes to learn from, Honcho has data to
  work with. Wiring it earlier would have nothing to observe.
- **M4 fourth** — the extension is the highest daily-dopamine surface, but its quality
  depends on M1 + M3. *Exception:* a thin "quick-capture to inbox" extension can ship in
  parallel any time (no AI dependency) — see sub-plan 03 §"MVP slice".
- **M5 last** — volume tooling only matters once single-item quality is proven; otherwise you
  just scale slop.

**Parallelizable:** extension quick-capture MVP; LinkedIn vs. YouTube playbooks; Honcho
wrapper scaffolding can begin during M2.

---

## 6. Pressure-test (gstack review lenses)

**CEO / founder lens — is this the 10-star product?**
- The moat is the voice/learning loop, not the feature count. Resist shipping IG + Twitter
  before the LinkedIn+YT loop is *proven to write like you*. Breadth before depth = slop at
  scale.
- The single metric that matters: **"% of generated drafts you ship with only light edits."**
  If that climbs over time, the moat is real. Instrument it from M2 (see sub-plan 04).
- Bigger vision worth holding in mind (don't build yet): the same engine powers a "daily
  brief" that proposes today's posts + comments before you even ask.

**Engineering lens — soundness & risk.**
- **Two memory systems** (pgvector + Honcho) is the main complexity risk. Mitigation: strict
  separation (facts vs. behavior) and a **raw `learning_events` log we own**, so we're never
  locked into Honcho and can replay/rebuild.
- **Serverless timeouts**: batch/multi-platform generation can exceed Vercel function limits.
  Reuse the existing deferred-enrichment pattern (write row → async generate → Supabase
  Realtime pushes result). Don't generate 4 platforms synchronously in one request.
- **Embeddings cost/latency**: batch embed on ingest, cache, use `text-embedding-3-small`.
- Keep the existing OpenAI-primary / Anthropic-fallback adapter; extend it, don't fork it.

**Design lens — UX.**
- **Editing is the main act** (and the training data). The repurpose UI must make editing and
  copying faster than rewriting from scratch, or the loop dies.
- **Voice onboarding must be near-zero friction** — "learn as I go," not a 50-question quiz.
  Capture 2–3 samples, infer the rest, refine silently.
- **KB must not feel like homework.** Ingest passively: every saved idea and every published
  post auto-becomes KB. Manual entry is the exception, not the rule.
- Comment assistant: ≤2 clicks from "see post" to "comment on clipboard."

**DevEx lens.**
- Extension needs its own MV3 build/dev loop inside the monorepo; document it.
- `HONCHO_API_KEY` lives in Supabase secrets today — also add to **Vercel env** (functions
  call it) and the **worker env** (nightly refresh job).
- Keep schema changes as ordered Supabase migrations (matches existing convention).

---

## 7. Cross-cutting foundations (do once, early in M1)

1. **Enable `pgvector`** in Supabase (`create extension vector`).
2. **`lib/ai.js` shared module** (server) — embeddings + a `buildContext()` that assembles
   `KB chunks + voice brief + platform playbook` for any generator. The current
   `api/ideas/[id]/ai.js` prompt-building moves here so repurposing + extension reuse it.
3. **`lib/honcho.js` wrapper** (thin; verify SDK surface at implementation time).
4. **`learning_events` table** — append-only event log (the durable spine of M3).
5. **Env propagation** — `HONCHO_API_KEY`, embedding model name → Vercel + worker.

---

## 8. Risks & open questions to revisit

- **Honcho SDK surface** — confirm Python + JS SDK shapes (peers/sessions/representations,
  dialectic query) before M3 build; the wrapper isolates this.
- **LinkedIn DOM stability** — the extension scrapes post content; LinkedIn changes markup
  often. Keep selectors in one config file; degrade gracefully.
- **Past-post import** — "learn as I go" was chosen, but a one-time paste of 5–10 best posts
  per platform would bootstrap the voice profile dramatically. Offered as optional in M1.
- **Instagram + Twitter/X** — deferred, not dropped. Playbook system (sub-plan 02) is built to
  add a platform as a config entry, so these are low-effort fast-follows.
