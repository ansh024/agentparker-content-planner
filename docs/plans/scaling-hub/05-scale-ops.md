# Sub-plan 05 — Scale & Content Ops (M5)

**Goal:** the payoff layer — let you do **more volume of everything, every day**, without
offloading judgment. Batch the mechanical parts, queue the decisions, make daily output
visible. Build last: volume only helps once single-item quality (M1–M4) is proven.

> Your framing: *"I don't want to offload 100% — I want to scale, so I can do more volume of
> everything daily."* This layer is exactly that: it compresses the time per item and removes
> the blank-page tax, while you stay the approver on every post and comment.

---

## 1. Daily Content Ops dashboard

A single "today" view that turns the system into a daily operating rhythm:

- **Today's queue** — drafts ready to review, comments suggested, ideas to triage, listening
  angles worth acting on — all in one prioritized list.
- **Volume targets & streak** — set a daily goal (e.g. *2 posts + 10 comments*), track
  progress, keep a streak. Lightweight accountability, not gamification slop.
- **One-screen triage** — approve/edit/copy without page-hopping.

## 2. Batch generation

- **Batch repurpose** — select N inbox ideas → generate drafts across chosen platforms in one
  action (fan-out over the M2 async pattern; results stream into the drafts list).
- **Listening → drafts** — promote a listening cluster/angle straight into platform drafts
  (bridges the existing listening engine into the repurpose engine).
- **Weekly content plan** — "fill my week": propose a calendar of posts from KB + listening +
  inbox, balanced across LinkedIn/YouTube; you accept/swap. Writes `content_plans` rows.

## 3. ~~Comment queue (engagement at volume)~~ — CUT at autoplan gate

> **Removed.** Both review voices flagged batch-comments-at-volume as slop by construction and
> the most ToS-exposed surface — it contradicts the no-slop thesis the whole hub is built on.
> The engagement path stays **1-at-a-time**: the thoughtful, in-context comment assistant in
> the Chrome extension (sub-plan 03). You engage deliberately, one post at a time, in your
> voice — quality over queue. The `engagement_queue` table below is therefore **not built**.

## 4. Daily digest (optional)

- A morning summary: today's queue + new listening signals + suggested posts/comments.
- Delivery: email, or reuse `profiles.telegram_chat_id` (already in schema). Cheap, async,
  via the existing cron/worker.

---

## Schema (small additions)

```sql
-- Daily targets / streak
alter table profiles add column daily_targets jsonb;  -- {posts:2, comments:10}

-- engagement_queue table CUT at autoplan gate (no batch comment queue — see §3).
```

Batch generation reuses M2 endpoints (fan-out); ops views are mostly read aggregations over
existing tables. Keep it thin — this layer is orchestration, not new intelligence.

---

## API surface

- `POST /api/repurpose/batch` — `{idea_ids, platforms}` → fan-out to M2 generation.
- `POST /api/plan/week` — propose a week of `content_plans` from KB + listening + inbox.
- `GET /api/ops/today` — aggregate queue (drafts/triage/angles) for the dashboard.
  *(No comment queue — engagement is 1-at-a-time via the extension.)*

---

## Acceptance criteria

- [ ] "Today" dashboard aggregates drafts + comments + triage + angles in one prioritized view.
- [ ] Batch-repurpose multiple ideas → drafts stream in without timeouts.
- [ ] "Fill my week" proposes a balanced calendar you can accept/edit.
- [ ] Daily targets + streak tracked; optional digest delivered.

## Risks
- **Scaling slop** → this layer is gated on M1–M4 quality; never enable batch before single-item
  quality is proven (CEO-lens guardrail).
- **Volume pressure → spam** → targets are personal & soft; everything stays draft + manual send;
  quality signals from M3 should *gate* what's surfaced, not just maximize count.
- **Cost at volume** → batch embeds/generations; cache voice briefs; keep cheap-model defaults
  with escalation only where it matters.
