# Sub-plan 02 — Multi-platform Repurposing Engine (M2)

**Goal:** turn one idea into multiple platform-native drafts — each written for how that
platform actually works — grounded in your KB and written in your voice.

> **Revised at autoplan gate: LinkedIn ONLY for M2.** Prove the full loop (generate → edit →
> copy → outcome) where the tool's leverage is real (text). YouTube, Instagram, and Twitter/X
> are **evidence-gated fast-follows** — the playbook system below is built so adding each is a
> config entry, but none ship until the LinkedIn loop is shown to lift real outcomes. The
> YouTube playbook spec stays below as the *next* fast-follow reference, not M2 scope.

---

## The core principle

A repurpose is **not** "same text, different length." Each platform has its own native
*shape* — hook style, structure, length, formatting, CTA conventions, what flops. The engine
encodes those as **playbooks** and generates *for* the platform, not *translated* to it.

```
        ┌─────────────┐
 idea → │  repurpose  │ → LinkedIn post (hook + story + takeaway + soft CTA)
        │   engine    │ → YouTube package (title options + script beats + description + chapters)
        │             │ → [Instagram carousel + caption]   (fast-follow)
        │  per-       │ → [Twitter/X thread]               (fast-follow)
        └─────────────┘
              ▲
   KB facts + voice brief + platform playbook
```

---

## Platform playbooks (`api/_platforms.js`)

A config map — adding a platform = adding an entry. Each playbook defines the prompt
contract + output schema. **Build LinkedIn + YouTube now.**

```js
export const PLATFORMS = {
  linkedin: {
    label: "LinkedIn",
    formats: ["post"],                 // later: "carousel", "article"
    guidance: `Professional but human. Strong first line (the feed truncates ~210 chars —
      earn the "see more"). Short paragraphs, generous line breaks, one idea per line.
      A story or concrete result beats abstraction. End with a reflective question or soft
      CTA, NOT "Agree? 👇 follow me". Max ~3 tasteful hashtags. No engagement-bait.`,
    schema: { hook, body, takeaway, soft_cta, hashtags },
  },
  youtube: {
    label: "YouTube",
    formats: ["long_form", "short", "community_post"],
    guidance: `Plan a video, not a paragraph. Title must be curiosity-or-benefit driven
      (give 3 options). Script = hook (first 15s earns the click-through), then beats with
      retention turns. Provide a description with keywords + timestamps/chapters. For Shorts:
      one idea, fast hook, loopable ending.`,
    schema: { title_options, hook, script_beats, description, chapters, tags },
  },
  // instagram, twitter → added later as entries (fast-follow)
};
```

> Keeping playbooks declarative is what makes IG/Twitter "fast-follows" rather than rebuilds —
> matches the CEO-lens guidance to add platforms cheaply once the loop is proven.

---

## Schema — drafts become first-class

Drafts deserve their own table (multiple per idea, per-platform status, versioning,
calendar + learning linkage) rather than living in `ideas.metadata`.

```sql
create table content_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  idea_id uuid references ideas(id) on delete set null,   -- source idea (nullable: net-new)
  platform text not null,                                  -- linkedin | youtube | ...
  format text not null default 'post',                    -- per-platform format
  title text,
  body text,                                              -- main content
  structured jsonb,                                       -- platform-specific fields (hooks, beats…)
  status text default 'draft',                            -- draft | edited | ready | scheduled | posted
  version int default 1,
  ai_meta jsonb,                                          -- model, context used, generated_at
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_drafts_user_status on content_drafts(user_id, status);
create index idx_drafts_idea on content_drafts(idea_id);
```

RLS: per-user + service_role (same pattern). Add to `supabase_realtime` (async generation
pushes drafts in as they finish). `content_plans.target_platform` already exists → scheduling
a draft to the calendar is a small join, no calendar rework.

---

## API surface

- `POST /api/ideas/[id]/repurpose` — body `{platforms:[...], formats?}`. **Async pattern**
  (avoids serverless timeout, reuses deferred-enrichment approach):
  1. Insert one `content_drafts` row per platform with `status='draft'`, empty body.
  2. Kick off generation per platform (each: `buildContext()` from sub-plan 01 → playbook
     prompt → LLM → fill row). Return immediately with draft IDs.
  3. UI subscribes via Realtime; drafts populate as each completes.
- `POST /api/drafts/generate` — net-new draft from a raw prompt/KB query (not tied to an idea).
- `PATCH /api/drafts/[id]` — save edits. **Critical:** on edit, emit a `learning_event`
  (sub-plan 04) capturing the generated→final diff. This is the main training signal.
- `GET /api/drafts` — list/filter (by platform, status, idea).
- `POST /api/drafts/[id]/schedule` — create a `content_plans` row (date + platform).

Generation reuses the existing OpenAI-primary / Anthropic-fallback adapter — extend
`api/ideas/[id]/ai.js`'s generator into the shared `api/_ai.js`, don't fork it.

---

## UI

- **Idea Detail → "Repurpose" panel:** platform multi-select → "Generate". Tabs appear per
  platform; each draft streams in (skeleton → content). Per tab:
  - Inline editable fields (LinkedIn: hook/body/CTA; YouTube: title options, beats,
    description).
  - **Copy** button per field and "Copy all" (the whole point — draft + 1-click copy).
  - **Schedule** → calendar. **Mark ready/posted.**
  - A subtle "✦ on-voice" indicator showing it used your voice profile + which KB docs
    grounded it (trust + transparency).
- **Drafts list** (new nav item or a Board column): everything in flight across platforms.
- Editing must feel *faster than rewriting* — autosave, keyboard copy, no modal friction.
  (Design-lens priority: editing is the main act AND the training data.)

---

## Acceptance criteria

- [ ] `content_drafts` migrated with RLS + Realtime.
- [ ] One idea → LinkedIn post + YouTube package generated, each visibly platform-shaped
      (not the same text reflowed).
- [ ] Drafts are grounded (cite KB) and on-voice (use `voice_profile`).
- [ ] Generation is async; drafts stream into the UI; no request timeouts.
- [ ] Edit → autosave → a `learning_event` diff is recorded.
- [ ] Copy-all and schedule-to-calendar both work.
- [ ] Adding a 3rd platform later = a `_platforms.js` entry + (if needed) a UI tab, nothing more.

## Risks
- **Timeouts on multi-platform** → strictly async/Realtime (designed in above).
- **Drafts feel generic** → hard dependency on M1 quality; gate M2 polish on M1 acceptance.
- **Schema drift across platforms** → `structured jsonb` absorbs platform-specific shapes;
  only `title`/`body` are columns.
