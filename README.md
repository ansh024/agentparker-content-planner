# ContentPlanner

> **Never lose an idea again. Always know what your audience wants to hear next.**

A PWA built for content creators to capture inspiration, monitor trends, and plan their publishing pipeline — all in one place.

**Live:** [agentparker-content-planner on GitHub](https://github.com/ansh024/agentparker-content-planner) · **Stack:** React + Vite · Supabase · Vercel Serverless · Python Worker

---

## What It Does

ContentPlanner solves two core creator problems:

1. **Inspiration loss** — You see a great post while scrolling. By the time you open Notion, the spark is gone. ContentPlanner is installed as a PWA so you can share any link directly from Instagram, YouTube, or the web into your inbox in seconds.

2. **Content blindness** — Creators plan in a vacuum without knowing what their audience is actually discussing. The listening engine monitors Reddit, Hacker News, and YouTube for your topics daily, surfaces trending clusters, and generates AI briefs with content angles.

---

## Core Features

### Idea Inbox
- Share any link from any app via the OS share sheet (Web Share Target API)
- **Compose screen** — before saving, add a title, note/brief, status, tags, and assign a topic
- AI enrichment runs in the background: preview image, caption, 2-sentence AI summary
- Supports Instagram reels (video + transcript), YouTube (oEmbed + thumbnail), and generic web pages
- Filter by status, platform, search full-text; bulk status changes; CSV export

### Idea Detail
- Full source context: platform, author, preview media, AI-generated summary
- Add personal notes; generate AI outputs: **Brief** (why it works + creator angles), **Hooks** (6 hook lines), **Script** (beats + caption draft + CTA)
- One-click schedule to Content Calendar

### Content Calendar
- Visual week/month grid; drag ideas onto dates
- Tracks publishing status from Inbox through to Posted

### Social Listening
- Define topics with keywords and platforms (Reddit, HN, YouTube)
- Daily cron job runs a Python worker that queries each platform, synthesizes signals with an LLM, and produces scored clusters
- **AI Briefs** — per-topic briefs with trending angles, top sources, and suggested hooks
- Save any cluster or angle straight to your Inbox as a new idea

### PWA
- Installable on iOS and Android from the browser
- Web Share Target registered: share links from any app directly into the compose screen
- Works offline for browsing saved ideas

---

## Use Cases

| Who | How they use it |
|---|---|
| **Solo creator** | Saves inspiration from IG/YouTube while browsing, triages weekly, generates hooks before filming |
| **Content strategist** | Monitors competitor topics + audience Reddit threads; brief summaries cut research time |
| **Ghostwriter** | Captures client-shared links, assigns topics per client, exports CSV for reporting |
| **Newsletter writer** | Listens to HN + Reddit for niche signals; AI brief → draft script in one click |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser / PWA                     │
│  React 18 + React Router 7 + shadcn/ui + Tailwind   │
│                                                      │
│  /inbox    /share    /topics    /calendar    /board  │
└───────────────────┬─────────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────────┐
│              Vercel Serverless Functions             │
│                                                      │
│  POST /api/import          → capture + enrich idea  │
│  POST /api/ideas/:id/enrich → deferred enrichment   │
│  POST /api/ideas/:id/ai    → brief / hooks / script │
│  GET|POST /api/ideas       → list + CRUD            │
│  GET|POST /api/topics      → listening topics        │
│  POST /api/listening/run   → trigger worker run     │
│  GET|POST /api/plans       → content calendar       │
│  GET /api/cron/listening   → daily cron trigger     │
└─────┬─────────────────────────────┬─────────────────┘
      │                             │
┌─────▼──────────┐     ┌───────────▼──────────────────┐
│   Supabase     │     │   Python Listening Worker     │
│                │     │   (Railway)                   │
│  PostgreSQL    │     │                               │
│  Auth          │     │  last30days-skill (vendored)  │
│  Realtime      │     │  Reddit · HN · YouTube        │
│  Storage       │     │  → LLM synthesis              │
│  Row-Level Sec │     │  → clusters + briefs          │
└────────────────┘     └──────────────────────────────┘
```

### Key tables

| Table | Purpose |
|---|---|
| `ideas` | Captured inspiration — title, URL, platform, status, tags, AI summary, media |
| `listening_topics` | User-defined topics with keywords + platform targets |
| `listening_runs` | Each worker execution per topic |
| `listening_clusters` | Scored trend clusters within a run |
| `listening_briefs` | AI-generated briefs per run |
| `listening_hits` | Raw source articles/posts |
| `content_plans` | Scheduled publish dates linking ideas to calendar slots |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 6 + React Router 7 |
| UI | shadcn/ui (Radix UI) + Tailwind CSS |
| Drag & Drop | dnd-kit |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Supabase — Postgres + Auth + Realtime + Storage |
| AI | OpenAI `gpt-4.1-mini` (primary) · Anthropic `claude-haiku-4-5` (fallback) |
| Listening | Python worker on Railway + `last30days-skill` (vendored) |
| Media enrichment | Instagram page scrape + ScrapeCreators transcript API |
| Cron | Vercel Cron (daily at 13:00 UTC) |

---

## Project Structure

```
content-planner/
├── app/                        React + Vite PWA
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SharePage.jsx         Compose screen (Web Share Target)
│   │   │   ├── InboxPage.jsx         Idea list + filters + bulk ops
│   │   │   ├── IdeaDetailPage.jsx    Detail + AI generation
│   │   │   ├── TopicsPage.jsx        Listening dashboard + briefs
│   │   │   ├── TopicDetailPage.jsx   Per-topic clusters + hits
│   │   │   ├── CalendarPage.jsx      Content calendar
│   │   │   ├── BoardPage.jsx         Kanban board view
│   │   │   └── SettingsPage.jsx      Account + app settings
│   │   ├── components/
│   │   │   ├── common/               PageHeader, StatusBadge, EmptyState …
│   │   │   ├── listening/            BriefView, ClusterCard, HitCard …
│   │   │   └── ui/                   shadcn/ui primitives
│   │   └── lib/
│   │       ├── shareTarget.js        resolveSharePayload, detectPlatform
│   │       └── ideaImport.js         Import status helpers
│   └── public/
│       └── manifest.json             PWA manifest + share_target config
│
├── api/                        Vercel Serverless Functions
│   ├── import/
│   │   ├── index.js                  POST /api/import — create idea
│   │   ├── _enrich.js                Enrichment engine (Instagram/YT/generic)
│   │   └── _helpers.js               URL/text parsing utilities
│   ├── ideas/
│   │   ├── index.js                  GET|POST /api/ideas
│   │   ├── [id].js                   GET|PATCH|DELETE /api/ideas/:id
│   │   ├── [id]/ai.js                POST /api/ideas/:id/ai
│   │   └── [id]/enrich.js            POST /api/ideas/:id/enrich (deferred)
│   ├── topics/                       GET|POST|DELETE /api/topics
│   ├── plans/                        GET|POST|PATCH|DELETE /api/plans
│   ├── listening/run.js              POST — trigger worker run
│   └── cron/listening.js             Daily cron handler
│
├── worker/                     Python listening worker (Railway)
│   ├── main.py                       Entry point — orchestrates per-topic runs
│   ├── bridge.py                     last30days-skill integration
│   ├── llm_client.py                 OpenAI / Anthropic LLM adapter
│   ├── synthesize_llm.py             Cluster + brief synthesis
│   └── vendor/last30days-skill/      Vendored social search library
│
└── supabase/migrations/        Database schema + RLS policies
```

---

## Local Development

```bash
# 1. Clone & install
git clone https://github.com/ansh024/agentparker-content-planner
cd content-planner
npm install          # root (API deps)
cd app && npm install

# 2. Environment variables
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#          OPENAI_API_KEY (or ANTHROPIC_API_KEY), SCRAPECREATORS_API_KEY

# 3. Run Supabase migrations
npx supabase db push

# 4. Start dev server + API
cd app && npm run dev          # http://localhost:3000
npx vercel dev                 # API functions on :3000/api/*

# 5. Test the share flow
# Open http://localhost:3000/share?url=https://youtube.com/watch?v=...&title=Test
```

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Public anon key (client auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-side writes) |
| `OPENAI_API_KEY` | ✅* | AI enrichment + generation (primary) |
| `ANTHROPIC_API_KEY` | ✅* | Fallback if OpenAI not set |
| `SCRAPECREATORS_API_KEY` | ☑️ | Instagram reel transcripts (optional) |

*At least one AI key is required.

---

## Share Flow (PWA)

When ContentPlanner is installed as a PWA, it registers as a share target via the Web Share Target API. Sharing a link from any app works like this:

1. Tap **Share** on any post/page in Instagram, YouTube, Safari, etc.
2. Select **ContentPlanner** from the share sheet
3. The **compose screen** opens with the link pre-loaded
4. Add a title, note, status, tags, and optionally assign a listening topic
5. Tap **Save idea** — the idea appears in your inbox instantly
6. AI enrichment (preview image, summary, transcript for reels) fills in automatically in the background via Supabase Realtime

---

## License

MIT
