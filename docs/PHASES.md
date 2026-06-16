# Execution Phases — ContentPlanner

> **Status:** Draft v0.1  
> **Last updated:** 2026-06-16

---

## Overview

4 phases. Ship each one, use it, learn from it, then build the next.  
Each phase has a clear **definition of done** — no moving on until it's met.

---

## Phase 0 — Foundation (Days 1-3)

**Goal:** Repo is set up. You can run things locally. Everything is wired but empty.

### Tasks

- [ ] Initialize React + Vite + Tailwind project in `/app`
- [ ] Create Supabase project, get keys
- [ ] Set up Supabase local dev (CLI)
- [ ] Write initial database migration (all tables from ARCHITECTURE.md)
- [ ] Configure Vercel deployment from `/app`
- [ ] Set up Supabase Auth (magic link)
- [ ] Create `/api` directory with Vercel function scaffolding
- [ ] Set up Telegram bot via @BotFather, get token
- [ ] Add all env vars to Vercel and local `.env`
- [ ] Verify Supabase connection from local React app

### Definition of Done
- [ ] `npm run dev` shows a blank React page
- [ ] Can log in with magic link
- [ ] Supabase tables exist (verified in dashboard)
- [ ] Vercel deploys without errors

---

## Phase 1 — Dogfood: Manual Capture + Inbox (Days 4-14)

**Goal:** Replace your Notion content planner. Capture ideas via URL paste + notes. See them in an inbox. Drag to a simple calendar.

### Tasks

#### 1.1 Core Inbox UI
- [ ] `IdeaInbox` page — grid of idea cards
- [ ] `IdeaForm` component — URL input + text note + source platform picker
- [ ] `IdeaCard` component — thumbnail, title, source badge, context snippet, status chip, date
- [ ] Filter ideas by status (new / planned / done / archived)
- [ ] Quick status change (dropdown or right-click)
- [ ] Delete idea with confirmation

#### 1.2 Calendar
- [ ] `ContentCalendar` page — month view with date cells
- [ ] Drag idea from sidebar/queue onto a date cell
- [ ] Calendar shows idea thumbnail on the date
- [ ] Click idea on calendar → see detail
- [ ] Reschedule: drag from one date to another

#### 1.3 API Routes
- [ ] `POST /api/ideas` — create from manual input
- [ ] `GET /api/ideas` — list with filters
- [ ] `PATCH /api/ideas/:id` — update status/tags
- [ ] `DELETE /api/ideas/:id`
- [ ] `POST /api/plans` — add to calendar
- [ ] `GET /api/plans?start=...&end=...` — get date range
- [ ] `PATCH /api/plans/:id` — move date
- [ ] `DELETE /api/plans/:id`

#### 1.4 Enrichment
- [ ] `POST /api/enrich` — given URL, return OG metadata + AI summary
- [ ] Call when idea is created (async, don't block the UI)
- [ ] Show loading state on card, then populate

#### 1.5 Real-time
- [ ] Subscribe to `ideas` table changes
- [ ] New ideas appear in inbox without refresh
- [ ] Calendar updates when plans change

### Definition of Done
- [ ] You can paste a URL + note → appears in inbox
- [ ] Idea card shows thumbnail, AI summary, source platform
- [ ] You can drag an idea to a date on the calendar
- [ ] Ideas flow: new → planned → drafted → published
- [ ] You've used it for 3 consecutive days for real content planning
- [ ] No Notion opened for content ideas during those 3 days

---

## Phase 2 — Universal Capture (Days 15-21)

**Goal:** Never copy-paste a URL again. Send from phone, it appears in inbox.

### Tasks

#### 2.1 Telegram Bot
- [ ] Webhook endpoint `POST /api/webhooks/tg`
- [ ] When user sends a link → extract URL + message text
- [ ] Lookup user by `telegram_chat_id` in `profiles`
- [ ] Create idea in Supabase
- [ ] Reply with confirmation and link preview
- [ ] Handle non-link messages gracefully ("Send me a link and I'll save it!")
- [ ] `/start` command → welcome message + link with user ID for manual pairing
- [ ] `/help` command → usage guide
- [ ] `/ideas` command → list recent ideas

#### 2.2 Profile Linking
- [ ] Settings page: enter Telegram username
- [ ] User sends `/start` to bot → bot stores `chat_id`
- [ ] User clicks "Verify" on dashboard → matches their user ID
- [ ] Store `telegram_chat_id` in `profiles`

#### 2.3 Composio Instagram (Optional in Phase 2)
- [ ] Set up Composio account + Instagram toolkit
- [ ] Create OAuth flow endpoint
- [ ] Create webhook receiver for Instagram DMs
- [ ] Extract reel URL + context → create idea
- [ ] Settings page: connect/disconnect Instagram

### Definition of Done
- [ ] You can forward a link to Telegram bot → appears in inbox in < 5 seconds
- [ ] Context text from Telegram is preserved
- [ ] Works for: Reels, YouTube, tweets, Reddit posts, any URL
- [ ] You've used Telegram capture for 3 consecutive days

---

## Phase 3 — Social Listening (Days 22-28)

**Goal:** The app tells you what topics are trending. Ideas come from listening, not just your feed.

### Tasks

#### 3.1 Listening Worker
- [ ] Set up Railway or fly.io project
- [ ] Add `last30days-skill` as git submodule in `/worker/vendor/`
- [ ] Write `worker/main.py` (FastAPI + cron handler)
- [ ] Write `worker/bridge.py` (SQLite → Supabase sync)
- [ ] Write `Dockerfile`
- [ ] Deploy worker, verify health endpoint
- [ ] Set up Railway cron job (daily 8am)

#### 3.2 Topic Management
- [ ] `ListeningTopics` page — list of monitored topics
- [ ] `TopicForm` — name + keywords + platforms + frequency
- [ ] Show `last_run_at` and next scheduled run
- [ ] Pause/resume a topic
- [ ] API routes: CRUD for `listening_topics`

#### 3.3 Results Dashboard
- [ ] `TopicResults` page — grid of listening hits
- [ ] Each hit: title, platform badge, snippet, engagement score, source link
- [ ] Filter by platform, sort by engagement
- [ ] "Capture as idea" button on any hit → creates idea with source_url and snippet as context
- [ ] Real-time subscription for new hits

### Definition of Done
- [ ] At least 1 topic is actively monitored
- [ ] Daily morning: new hits appear in the dashboard
- [ ] You've captured at least 3 ideas from listening hits
- [ ] Worker runs reliably for 5 consecutive days without manual intervention

---

## Phase 4 — Polish & Scale (Days 29+)

**Goal:** The product feels complete. Ready to show others or start SaaS prep.

### Tasks

#### 4.1 UX Polish
- [ ] Mobile-responsive dashboard (PWA-ready)
- [ ] Empty states for all pages (not blank screens)
- [ ] Loading skeletons on cards
- [ ] Error boundaries + graceful failures
- [ ] Keyboard shortcuts (n = new idea, 1/2/3 = filter status)

#### 4.2 Tags & Organization
- [ ] Tag management page (create, edit, delete, color)
- [ ] Multi-select ideas to bulk-tag
- [ ] Filter inbox by tag

#### 4.3 Export
- [ ] Export ideas as CSV
- [ ] Export calendar as CSV (for Notion/google calendar import)

#### 4.4 SaaS Prep (if validated)
- [ ] Multi-tenant: ensure RLS is rock solid
- [ ] Onboarding flow (3-step wizard)
- [ ] Usage limits per plan
- [ ] Stripe integration for payments
- [ ] Landing page
- [ ] Privacy policy + terms

### Definition of Done
- [ ] You'd feel comfortable showing this to another creator
- [ ] No obvious bugs or rough edges
- [ ] All data is exportable

---

## Phase Timing (Realistic, Solo)

| Phase | Estimated duration | Cumulative |
|---|---|---|
| Phase 0 — Foundation | 3 days | 3 days |
| Phase 1 — Dogfood | 10 days | 13 days |
| Phase 2 — Universal Capture | 7 days | 20 days |
| Phase 3 — Social Listening | 7 days | 27 days |
| Phase 4 — Polish & Scale | 7+ days | 34+ days |

These are working days, not calendar days. With a day job, expect 2-3 calendar days per working day.

---

## Learning Milestones

After each phase, create a **learning journal entry** (saved in `docs/journal/`):

1. What went well?
2. What was harder than expected?
3. What would you do differently?
4. What surprised you about usage?
5. One thing to change in the next phase based on this learning.

This feeds into the [LEARNING.md](./LEARNING.md) system.

---

*Phases will be updated as decisions change. Check DECISIONS.md for the rationale behind major choices.*
