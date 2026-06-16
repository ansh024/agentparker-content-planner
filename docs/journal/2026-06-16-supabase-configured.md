# Supabase configured — project live, migration applied, app connects

**Date:** 2026-06-16
**Session type:** setup
**Phase:** 0
**Mood:** 😌 smooth

---

## Context

Wired Supabase to the project — created project via CLI, linked, pushed migrations, got API keys, configured auth.

## What happened?

Switched Supabase accounts since original hit the 2-active-project limit. Created new project (gvhzuqbdvagnyellnoym, Mumbai). First migration partially failed — `TO service_role` must come before `USING` in CREATE POLICY syntax. Fixed with a repair migration using `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS`/recreate patterns. Real-time publication ADD TABLE fails on duplicate — wrapped in DO block with EXCEPTION.

## What I learned

- Supabase CLI migration push can partially apply on syntax error — need repair migrations with IF NOT EXISTS guards
- `TO service_role` placement matters in CREATE POLICY
- `ALTER PUBLICATION ... ADD TABLE` errors on duplicates — wrap in DO block
- Free tier limit is 2 active projects per org member — plan accordingly

## What should change?

- [ ] Add auth config note to docs (email confirm off for dev, site URL set)
- [ ] Consider documenting Supabase setup steps in a SETUP.md

## Tags

#supabase #process #bug #documentation
