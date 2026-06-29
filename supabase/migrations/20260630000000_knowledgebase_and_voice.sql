-- M1: Knowledgebase (pgvector RAG) + Voice Profile
-- See docs/plans/scaling-hub/01-knowledgebase-voice.md
--
-- Two stores:
--   kb_documents / kb_chunks  → factual/explicit memory (semantic retrieval)
--   voice_profile             → structured "how this user writes" model
--
-- RLS mirrors the existing convention: per-user owner policies + a
-- service_role full-access policy for server-side ingest (see ideas table).
--
-- SECURITY NOTE (Eng review critical #2): match_kb_chunks takes match_user as
-- an argument, but the server ALWAYS passes the id derived from the caller's
-- Bearer token (api/_auth.js → requireUser), never a request-body value. The
-- function additionally hard-filters on c.user_id = match_user so a single
-- tenant's rows are the only ones ever scanned.

create extension if not exists vector;

-- ── KB documents: the factual/explicit knowledgebase ────────────
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  kind text not null check (kind in
    ('expertise','belief','framework','story','swipe','reference','past_post')),
  title text,
  body text not null,
  source_url text,
  source_idea_id uuid references ideas(id) on delete set null,
  platform text,
  tags text[],
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kb_documents enable row level security;

create policy "Users can read own kb_documents" on kb_documents
  for select using (auth.uid() = user_id);
create policy "Users can insert own kb_documents" on kb_documents
  for insert with check (auth.uid() = user_id);
create policy "Users can update own kb_documents" on kb_documents
  for update using (auth.uid() = user_id);
create policy "Users can delete own kb_documents" on kb_documents
  for delete using (auth.uid() = user_id);
create policy "Service role full access on kb_documents" on kb_documents
  for all to service_role using (true) with check (true);

create index idx_kb_documents_user_kind on kb_documents(user_id, kind, created_at desc);

-- ── KB chunks: embedded slices for retrieval ────────────────────
create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references kb_documents(id) on delete cascade,
  user_id uuid references profiles(id) not null,
  content text not null,
  embedding vector(1536),          -- text-embedding-3-small
  token_count int,
  created_at timestamptz default now()
);

alter table kb_chunks enable row level security;

create policy "Users can read own kb_chunks" on kb_chunks
  for select using (auth.uid() = user_id);
create policy "Users can insert own kb_chunks" on kb_chunks
  for insert with check (auth.uid() = user_id);
create policy "Users can update own kb_chunks" on kb_chunks
  for update using (auth.uid() = user_id);
create policy "Users can delete own kb_chunks" on kb_chunks
  for delete using (auth.uid() = user_id);
create policy "Service role full access on kb_chunks" on kb_chunks
  for all to service_role using (true) with check (true);

create index idx_kb_chunks_user on kb_chunks(user_id);
-- hnsw over ivfflat (Eng review): better recall/latency, no list-count tuning,
-- and no rebuild needed as the table grows from a cold start.
create index idx_kb_chunks_embedding on kb_chunks
  using hnsw (embedding vector_cosine_ops);

-- ── Voice profile: one evolving row per user ────────────────────
create table voice_profile (
  user_id uuid primary key references profiles(id),
  summary text,
  tone_descriptors text[],
  do_rules text[],
  dont_rules text[],
  signature_moves text[],
  sample_count int default 0,
  raw jsonb,
  updated_at timestamptz default now()
);

alter table voice_profile enable row level security;

create policy "Users can read own voice_profile" on voice_profile
  for select using (auth.uid() = user_id);
create policy "Users can insert own voice_profile" on voice_profile
  for insert with check (auth.uid() = user_id);
create policy "Users can update own voice_profile" on voice_profile
  for update using (auth.uid() = user_id);
create policy "Service role full access on voice_profile" on voice_profile
  for all to service_role using (true) with check (true);

-- ── Retrieval RPC: semantic search, tenant-scoped ───────────────
-- match_user is supplied by the server from the Bearer-token user id only.
create function match_kb_chunks(
  query_embedding vector(1536),
  match_user uuid,
  match_count int default 8
)
returns table (content text, document_id uuid, kind text, similarity float)
language sql stable as $$
  select c.content, c.document_id, d.kind,
         1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c
  join kb_documents d on d.id = c.document_id
  where c.user_id = match_user
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Live ingest progress (mirrors the enrichment realtime pattern).
alter publication supabase_realtime add table kb_documents;
alter publication supabase_realtime add table kb_chunks;
alter publication supabase_realtime add table voice_profile;
