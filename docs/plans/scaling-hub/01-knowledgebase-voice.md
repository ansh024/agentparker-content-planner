# Sub-plan 01 — Knowledgebase + Voice Profile (M1)

**Goal:** a personal knowledgebase the AI can ground on, plus an evolving voice profile, so
every downstream generation is *factually yours* and *sounds like you*.

> This is the foundation. Sub-plans 02–05 all read from it. Build to make the *next* thing
> easy, not to be exhaustive.

---

## What needs to be stored (the KB content model)

Thinking through "what goes in a content creator's knowledgebase," there are six kinds —
each maps to a `kind` enum on one `kb_documents` table (one table, typed, keeps it simple):

| `kind` | What it is | Why the AI needs it | How it's captured |
|---|---|---|---|
| `expertise` | Topics you can speak on with authority | Scopes what to write about; prevents bluffing | Onboarding + inferred from posts |
| `belief` | Strong takes / opinions / contrarian views | The spine of non-generic content — *your* angle | Onboarding + "save as take" from anywhere |
| `framework` | Mental models, step-by-step methods, your IP | Reusable structure for posts/scripts | Manual + extracted from long posts |
| `story` | Personal anecdotes, case studies, results, numbers | Concrete proof → credibility, stops slop | Manual + flagged in captured ideas |
| `swipe` | Posts/hooks/formats you admire (others' or yours) | Style references to emulate (not copy) | Saved ideas marked "swipe" + extension |
| `reference` | Source material, research, links, transcripts | Facts to cite/ground a specific piece | Existing capture pipeline → KB |
| `past_post` | Your own published content | Voice ground truth + "don't repeat myself" | Paste/import + auto on publish (M3) |

Plus two profile-level stores:
- **Interests & curiosities** — what you *want* to explore (distinct from settled expertise).
  Reuse/extend `listening_topics` (already "topics + keywords") + a `curiosity` flag, rather
  than a new table.
- **Voice profile** — the structured "how you write" model (below).

> Insight: the existing `ideas` table is already a proto-KB. The plan **promotes captured
> ideas into KB documents** rather than building a parallel silo — one capture path, two
> uses (inspiration queue + grounding corpus).

---

## Schema (new migration)

```sql
create extension if not exists vector;

-- Documents: the factual/explicit knowledgebase
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  kind text not null check (kind in
    ('expertise','belief','framework','story','swipe','reference','past_post')),
  title text,
  body text not null,
  source_url text,
  source_idea_id uuid references ideas(id) on delete set null, -- if promoted from an idea
  platform text,           -- for past_post/swipe: which platform it's from
  tags text[],
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chunks: embedded slices for retrieval
create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references kb_documents(id) on delete cascade,
  user_id uuid references profiles(id) not null,
  content text not null,
  embedding vector(1536),  -- text-embedding-3-small
  token_count int,
  created_at timestamptz default now()
);
create index on kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index idx_kb_chunks_user on kb_chunks(user_id);

-- Voice profile: one evolving row per user
create table voice_profile (
  user_id uuid primary key references profiles(id),
  summary text,                    -- 1-paragraph "how this person writes"
  tone_descriptors text[],         -- e.g. {direct, witty, no-fluff, contrarian}
  do_rules text[],                 -- "use short punchy lines", "open with a story"
  dont_rules text[],               -- "no hashtags walls", "never say 'in today's world'"
  signature_moves text[],          -- recurring patterns that read as 'you'
  sample_count int default 0,      -- how many samples informed it
  raw jsonb,                       -- full structured model + provenance
  updated_at timestamptz default now()
);
```

RLS: same per-user pattern as existing tables (owner select/insert/update/delete +
`service_role` full access for server-side ingest). Add all three to `supabase_realtime` so
the UI reflects ingest progress live (mirrors the enrichment pattern).

**Retrieval RPC** (semantic search, RLS-safe):
```sql
create function match_kb_chunks(
  query_embedding vector(1536), match_user uuid, match_count int default 8)
returns table (content text, document_id uuid, kind text, similarity float)
language sql stable as $$
  select c.content, c.document_id, d.kind,
         1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c join kb_documents d on d.id = c.document_id
  where c.user_id = match_user
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

---

## API surface

- `POST /api/kb` — create a KB document `{kind, title, body, source_url, tags}`. Server
  chunks (≈500 tokens, overlap), embeds each chunk, inserts `kb_chunks`.
- `GET /api/kb` — list/filter by `kind`, search.
- `PATCH/DELETE /api/kb/[id]` — edit/remove (re-embed on body change).
- `POST /api/kb/promote` — `{idea_id, kind}` → promote a captured idea into a KB document.
- `POST /api/kb/search` — `{query, k}` → embed query, call `match_kb_chunks`. (Internal helper
  used by sub-plans 02 & 03; exposed for a KB search UI too.)
- `GET /api/voice` / `POST /api/voice/bootstrap` — read profile; bootstrap from pasted samples.

**Shared module `api/_ai.js`** (the cross-cutting foundation):
- `embed(texts[])` → vectors (OpenAI `text-embedding-3-small`, batched).
- `retrieveContext(userId, query, k)` → top KB chunks formatted for a prompt.
- `voiceBrief(userId)` → compact string built from `voice_profile` (+ Honcho hints in M3).
- `buildContext({userId, query})` → `{ kbBlock, voiceBlock }` used by every generator.
- Move existing `api/ideas/[id]/ai.js` prompt assembly to consume this, so brief/hooks/script
  immediately benefit from grounding + voice (a nice early win that proves M1).

---

## Voice profile: "learn as I go" (your choice)

Low-friction bootstrap, then silent refinement:

1. **Onboarding (mandatory bootstrap — revised at autoplan gate):** paste **5–10 of your best
   posts** (LinkedIn-first) + answer 3 quick prompts ("topics you're known for", "a take you'll
   defend", "words/phrases you'd never use"). One LLM call distills this into the `voice_profile`
   row. This is **required in M1, not optional** — a solo creator's edit stream is far too sparse
   to learn voice from scratch, so we bootstrap hard and the static `voice_profile` becomes the
   contract every generator reads. (Bulk import must be rate-limited + batch-embedded via the
   worker — see Eng review; synchronous embed-on-POST will blow the function timeout.)
2. **Refinement (M3, automatic):** every time you edit an AI draft, the **diff** between
   generated and final is the highest-signal voice data. Honcho ingests it; a nightly job
   re-derives `voice_profile`. `sample_count` climbs; quality climbs.

The voice profile is injected into *every* generation prompt as a compact "write like this"
block — never dumped raw.

---

## UI (new "Knowledgebase" section)

- **KB page** — filter by kind, search (semantic + text), add/edit documents. Lives alongside
  Inbox/Topics in `AppLayout`.
- **Promote affordance** — on Idea Detail, a "Add to Knowledgebase" action (pick a kind).
- **Voice page** (under Settings) — view the inferred profile, edit do/don't rules, see
  `sample_count` and "last refined". Makes the learning visible & trustworthy.
- Reuse existing shadcn primitives + `PageHeader`, `EmptyState`, `SearchInput`.

---

## Acceptance criteria

- [ ] `pgvector` enabled; KB tables + RLS + retrieval RPC migrated.
- [ ] Can add a KB doc; chunks are embedded and stored; semantic search returns relevant chunks.
- [ ] Can promote a captured idea into KB in one click.
- [ ] Voice onboarding produces a usable `voice_profile` from ≤3 samples.
- [ ] `api/_ai.js` `buildContext()` works and the existing brief/hooks/script visibly improve
      (grounded in KB + on-voice) vs. before.
- [ ] KB ingest progress reflects live via Realtime.

## Risks
- **Embedding cost on bulk import** → batch, dedupe, cap chunk size.
- **Stale embeddings on edit** → re-embed changed docs (mark dirty, async re-embed).
- **Garbage-in voice** → cap onboarding influence; let M3 corrections dominate over time.
