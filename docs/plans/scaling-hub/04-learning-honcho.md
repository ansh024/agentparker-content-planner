# Sub-plan 04 — Learning Layer (Honcho) — LAST milestone, A/B-gated

**Goal:** close the loop. Every action — what you post, how you edit, which comment you pick,
explicit feedback — teaches the system your voice and judgment, so generations get more "you"
over time. **Honcho** is the behavioral-memory backbone (API key already in Supabase secrets).

> **Revised at autoplan gate — sequencing + status.** Moved from M3 to the **last** milestone
> and made **conditional**:
> - The **static `voice_profile` (from M1's mandatory bootstrap) is the contract** every
>   generator reads. M2/M3 ship and must be good on that alone.
> - Honcho is built only after there's a real edit/publish stream to learn from, and is
>   **promoted to the generation hot path only if it beats the static `voice_profile` in a
>   measured A/B** (use the light-edit ship-rate metric below as the comparator).
> - **Never call Honcho synchronously at generation time** (Eng review): read only the cached
>   `voice_profile` on the hot path; refresh it out-of-band in the nightly job.
> - **Honcho payload must be enumerated and PII-scrubbed** (Eng review): comment signals carry
>   third-party LinkedIn identity/content — strip or exclude it, make ingest opt-in, check DPA.
> - **Save draft first (commit), then emit `learning_event` async/best-effort** — never couple
>   the event/Honcho write into the user's save path.

---

## What Honcho is (and isn't) for us

Honcho is a personalization / agent-memory service that builds a **representation** of a user
from observed messages (theory-of-mind style) and answers questions about them ("dialectic").

- **Honcho = behavioral/voice memory:** *how* you write & think, derived from observed
  behavior. Returns a queryable representation we turn into a "voice brief."
- **pgvector (sub-plan 01) = factual memory:** *what* you know. Retrieval of concrete facts.

Keeping these separate is deliberate — Honcho is bad at "recall this exact framework" and
pgvector is bad at "infer their evolving tone." Each does what it's good at; `buildContext()`
merges both.

> **We do not lock into Honcho.** Every signal is *also* written to our own append-only
> `learning_events` table. If Honcho changes/dies, we replay events into a replacement. Honcho
> holds derived representations; we hold the raw truth.

---

## Signals we capture (ranked by value)

| Signal | Source | Why it's gold |
|---|---|---|
| **Draft edit diff** (generated → final) | M2 draft `PATCH`, extension edits | The single best "this is how I'd actually say it" signal |
| **Published post** (final text) | mark-posted in M2; (later) past-post import | Voice ground truth + topic coverage |
| **Comment picked + edited** | extension (M4) | High-frequency, conversational voice |
| **Accept / reject / regenerate** | any generation UI | Preference signal (what you won't ship) |
| **Explicit feedback** | 👍/👎, "more like this", "too salesy" chips | Direct correction |
| **Notes you write** | KB, idea notes | Substance + phrasing |

---

## Schema

```sql
create table learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  kind text not null,          -- edit_diff | published | comment_pick | feedback | reject | note
  surface text,                -- repurpose | extension | idea_ai | kb
  platform text,
  ref_type text, ref_id uuid,  -- e.g. draft / comment it relates to
  generated_text text,         -- what the AI produced (for diffs)
  final_text text,             -- what you actually used
  signal jsonb,                -- structured extras (rating, tags, diff stats)
  honcho_synced boolean default false,
  created_at timestamptz default now()
);
create index idx_learning_user_kind on learning_events(user_id, kind, created_at desc);
```

RLS: per-user + service_role. This table is the **durable spine**; Honcho is downstream of it.

---

## Architecture & flow

```
 UI/extension action ──► POST /api/learn/event ──► insert learning_events ──► lib/honcho.js
                                                          │                       │ ingest message
                                                          │                       ▼
                                                          │                 Honcho representation
 generation time ──► api/_ai.js voiceBrief() ◄────────────┴── reads voice_profile + Honcho query
                                                          ▲
 nightly worker job ── re-derive voice_profile ──────────┘ (from Honcho + recent events)
```

- **`api/_learn.js` + `POST /api/learn/event`** — single ingest endpoint. Writes the row, then
  fires Honcho ingest (best-effort, async; failure never blocks the user). Marks
  `honcho_synced`.
- **`lib/honcho.js`** — thin wrapper: `ingest(userId, event)`, `voiceQuery(userId, prompt)`,
  `ensurePeer(userId)`. **Verify the actual SDK surface (peers/sessions/representations/
  dialectic) at implementation time** — the wrapper isolates all Honcho specifics so the rest
  of the codebase never imports the SDK directly.
- **`voiceBrief(userId)`** (in `api/_ai.js`) — combines the structured `voice_profile` row with
  a fresh Honcho dialectic query ("how does this user prefer to phrase a LinkedIn post about
  X?"). Cached briefly to control latency/cost.
- **Nightly refresh** — extend the existing worker/cron: pull recent `learning_events` + Honcho
  representation → one LLM call → rewrite `voice_profile` (`sample_count++`, `updated_at`). This
  is what makes the Voice page visibly improve.

---

## The metric that proves the moat

Instrument **"light-edit ship rate"** = share of generated drafts/comments shipped with edit
distance below a threshold. Compute from `learning_events` (generated vs. final). Show a trend
on the Voice page. If it climbs week over week, the learning loop is working — this is the
single number that tells you the moat is real (CEO-lens ask from the overview).

---

## Acceptance criteria

- [ ] `learning_events` migrated; `/api/learn/event` ingests reliably and never blocks UX.
- [ ] M2 edits, M4 comment picks, and feedback chips all emit events.
- [ ] `lib/honcho.js` ingests events and answers a voice query; all Honcho access is behind it.
- [ ] `voiceBrief()` blends `voice_profile` + Honcho; generations measurably shift toward voice.
- [ ] Nightly job refreshes `voice_profile`; `sample_count` grows; Voice page shows last refresh.
- [ ] Light-edit ship-rate metric computed and charted.

## Risks
- **Honcho SDK uncertainty** → wrapper + our own event log = full insulation; can ship M2 voice
  on `voice_profile` alone and layer Honcho in without touching callers.
- **Latency at generation time** → cache voice brief; never call Honcho on the hot path
  synchronously if it's slow — fall back to the cached `voice_profile`.
- **Feedback sparsity** → lean on implicit signals (edit diffs, picks) which need no extra user
  effort; explicit chips are a bonus.
- **Privacy** → it's your own data, single-tenant per user under RLS; document what's sent to
  Honcho.
