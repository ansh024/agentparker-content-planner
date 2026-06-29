-- M2: Multi-platform repurposing — drafts become first-class.
-- See docs/plans/scaling-hub/02-repurposing-engine.md
--
-- One idea → N platform-native drafts (LinkedIn only for M2; the playbook
-- system in api/_platforms.js makes other platforms config-only fast-follows).
-- Generation is client-driven fan-out (one row per platform, each filled by a
-- per-draft endpoint) — server-side async-after-response is not reliable on
-- Vercel (Eng review critical #1).

create table content_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  idea_id uuid references ideas(id) on delete set null,   -- nullable: net-new drafts
  platform text not null,                                  -- linkedin | youtube | ...
  format text not null default 'post',
  title text,
  body text,
  structured jsonb,                                        -- platform-specific fields
  status text not null default 'draft',                    -- draft | generating | ready | edited | scheduled | posted | failed
  version int not null default 1,
  ai_meta jsonb,                                           -- model, kb docs used, generated_at
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table content_drafts enable row level security;

create policy "Users can read own content_drafts" on content_drafts
  for select using (auth.uid() = user_id);
create policy "Users can insert own content_drafts" on content_drafts
  for insert with check (auth.uid() = user_id);
create policy "Users can update own content_drafts" on content_drafts
  for update using (auth.uid() = user_id);
create policy "Users can delete own content_drafts" on content_drafts
  for delete using (auth.uid() = user_id);
create policy "Service role full access on content_drafts" on content_drafts
  for all to service_role using (true) with check (true);

create index idx_drafts_user_status on content_drafts(user_id, status);
create index idx_drafts_idea on content_drafts(idea_id);

-- Realtime so drafts populate live as each platform's generation completes.
alter publication supabase_realtime add table content_drafts;
