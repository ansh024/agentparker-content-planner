# Architecture Document — ContentPlanner

> **Status:** Draft v0.1  
> **Last updated:** 2026-06-16  
> **References:** PRD.md, DECISIONS.md

---

## 1. System Overview

ContentPlanner is a **3-service architecture** with a shared database:

```
┌──────────────────────────────────────────────────────────────┐
│                   CLIENT APPLICATIONS                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │ React SPA   │  │ Telegram Bot │  │ Instagram DM    │     │
│  │ (Dashboard) │  │ (@plannerbot)│  │ (@plannerbot)   │     │
│  └──────┬──────┘  └──────┬───────┘  └───────┬─────────┘     │
│         │                │                   │                │
└─────────┼────────────────┼───────────────────┼────────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌──────────────────────────────────────────────────────────────┐
│              API GATEWAY (Vercel Serverless)                   │
│                                                                │
│  /api/auth/*         Supabase Auth proxy (optional)           │
│  /api/ideas          CRUD for ideas                           │
│  /api/plans          Content calendar CRUD                    │
│  /api/topics         Listening topics management              │
│  /api/webhooks/ig    Instagram webhook receiver               │
│  /api/webhooks/tg    Telegram webhook receiver                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              SUPABASE (Shared State)                           │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐           │
│  │Auth      │  │Postgres  │  │Realtime            │           │
│  │(OAuth+   │  │(data)    │  │(WebSocket push     │           │
│  │magic     │  │          │  │ to dashboard)       │           │
│  │link)     │  │          │  │                   │           │
│  └──────────┘  └──────────┘  └───────────────────┘           │
│  ┌──────────────────────────────────────────────┐            │
│  │Storage (idea screenshots, OG images)          │            │
│  └──────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
                           ▲
                           │
┌──────────────────────────────────────────────────────────────┐
│              LISTENING WORKER (Railway / fly.io)               │
│                                                                │
│  ┌──────────────────────────────────────────────┐            │
│  │ FastAPI service                               │            │
│  │  - Cron: triggers last30days.py for each       │            │
│  │    active topic on schedule                    │            │
│  │  - Bridge: reads last30days SQLite output,     │            │
│  │    upserts into Supabase listening_hits        │            │
│  └──────────────────────────────────────────────┘            │
│  ┌──────────────────────────────────────────────┐            │
│  │ vendored: last30days-skill/ (git submodule)   │            │
│  └──────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Service Details

### 2.1 React SPA (Vercel)

**Path:** `/app/`  
**Stack:** React 18 + Vite + Tailwind CSS + Supabase JS client  
**Deploy:** Vercel (static site, free tier)

**Pages/Routes:**
| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard` | Redirects to /inbox if authed, else /login |
| `/login` | `Auth` | Supabase magic link or OAuth |
| `/inbox` | `IdeaInbox` | Grid/list of captured ideas, filter by status/tags |
| `/inbox/:id` | `IdeaDetail` | Single idea view with metadata, notes, AI summary |
| `/calendar` | `ContentCalendar` | Month/week calendar with drag-drop from idea queue |
| `/topics` | `ListeningTopics` | Manage monitored topics |
| `/topics/:topicId` | `TopicResults` | Listening hits for a specific topic |
| `/settings` | `Settings` | Profile, connected accounts, preferences |

**State Management:** React context for auth + Supabase real-time subscriptions. No Redux needed — the data model is small.

**Key Dependencies:**
- `@supabase/supabase-js` — database, auth, realtime
- `tailwindcss` — styling
- `react-beautiful-dnd` or `@dnd-kit/core` — calendar drag-drop
- `lucide-react` — icons

### 2.2 API Routes (Vercel Serverless)

**Path:** `/api/`  
**Stack:** Vercel functions (Node.js)  
**Auth:** Validate Supabase JWT on every request

**Endpoints:**

```
POST   /api/ideas              Create idea (manual URL paste)
GET    /api/ideas              List ideas (paginated, filterable)
GET    /api/ideas/:id          Get single idea
PATCH  /api/ideas/:id          Update idea (status, tags, notes)
DELETE /api/ideas/:id          Delete idea

POST   /api/plans              Add idea to calendar
GET    /api/plans              Get calendar entries (date range)
PATCH  /api/plans/:id          Move/reschedule plan entry
DELETE /api/plans/:id          Remove from calendar

POST   /api/topics             Create listening topic
GET    /api/topics             List user's topics
PATCH  /api/topics/:id         Update topic (keywords, frequency)
DELETE /api/topics/:id         Delete topic
GET    /api/topics/:id/hits    Get hits for topic

POST   /api/webhooks/ig        Receive Instagram DM webhook
POST   /api/webhooks/tg        Receive Telegram message webhook

GET    /api/enrich             Given a URL, return OG metadata + AI summary
```

**Note:** Most CRUD could be done client-side via Supabase JS client with RLS. API routes exist for:
- Webhooks (need server-side secret validation)
- Enrichment (calls external APIs — need server-side keys)
- Sensitive operations (delete, bulk update)

### 2.3 Listening Worker (Railway)

**Path:** `/worker/`  
**Stack:** Python 3.12+ + FastAPI + supabase-py  
**Deploy:** Railway (free tier: 500 hrs/month, 512MB RAM)

**Structure:**
```
worker/
├── main.py              FastAPI app + cron endpoints
├── bridge.py            SQLite → Supabase sync logic
├── requirements.txt     py dependencies
├── vendor/
│   └── last30days-skill/   (git submodule)
└── Dockerfile
```

**API:**
```
POST /run              Trigger all topics (called by cron or Railway scheduled jobs)
POST /run/:topicId     Trigger single topic
GET  /health           Health check
```

**Cron:** Railway scheduled job → `curl -X POST https://worker.railway.app/run` every day at 8am.

**Flow:**
1. Fetch active topics from Supabase
2. For each: `python3 scripts/last30days.py "<keywords>" --days=7 --store --quick`
3. `bridge.py` reads the SQLite DB, finds new hits, upserts into Supabase `listening_hits`

### 2.4 Telegram Bot

**Path:** Runs as part of `/api/webhooks/tg`  
**Stack:** `node-telegram-bot-api` within Vercel serverless

**Flow:**
1. User forwards a message/link to `@plannerbot`
2. Bot receives update via webhook
3. Extract URL, sender ID, message text
4. Lookup user by Telegram ID in Supabase
5. Create idea with `source_type=telegram`
6. Optionally reply: "Saved! 📌 [link preview]"

**Setup:**
- Create bot via @BotFather → get `TELEGRAM_BOT_TOKEN`
- Set webhook: `https://yourapp.vercel.app/api/webhooks/tg`

### 2.5 Instagram DM Capture

**Path:** Composio handles OAuth + webhook routing → hits our endpoint  
**Stack:** Composio Instagram toolkit

**Flow:**
1. User connects Instagram Business account via Composio OAuth flow
2. Composio creates a webhook subscription for DM events
3. When a DM arrives at the connected account, Composio forwards to our webhook
4. Our endpoint extracts reel URL + text, creates idea
5. Backend enriches with reel metadata via Composio

---

## 3. Database Schema

### 3.1 Tables

```sql
-- Core user table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  telegram_chat_id BIGINT,
  instagram_business_id TEXT,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- The core entity: a captured idea
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  source_url TEXT NOT NULL,
  source_platform TEXT,          -- 'instagram', 'reddit', 'twitter', 'youtube', 'web', 'manual'
  source_author TEXT,            -- @handle or channel name
  context_text TEXT,             -- user's note when capturing
  title TEXT,                    -- AI-generated or extracted title
  ai_summary TEXT,               -- AI-generated summary of source
  og_image_url TEXT,             -- OpenGraph image for preview
  status TEXT DEFAULT 'new',     -- 'new', 'planned', 'drafting', 'published', 'archived'
  tags TEXT[],                   -- array of tag names
  metadata JSONB,                -- platform-specific metadata (view count, engagement)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Content calendar: maps an idea to a scheduled date
CREATE TABLE content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  target_platform TEXT,          -- 'instagram', 'youtube', 'twitter', etc.
  status TEXT DEFAULT 'planned', -- 'planned', 'in_progress', 'published'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Listening topics: what we monitor
CREATE TABLE listening_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  platforms TEXT[] DEFAULT '{reddit,hackernews,youtube}',
  frequency TEXT DEFAULT 'daily',  -- 'daily', 'weekly'
  active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual hits from listening
CREATE TABLE listening_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES listening_topics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  source_url TEXT NOT NULL,
  platform TEXT,
  title TEXT,
  snippet TEXT,
  author TEXT,
  engagement_score INTEGER,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic_id, source_url)  -- deduplicate per topic
);

-- Tags for organizing ideas
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  UNIQUE(user_id, name)
);
```

### 3.2 Row Level Security (RLS)

Every table has RLS enabled with policies like:
```sql
-- Users can only see their own rows
CREATE POLICY "Users can read own ideas" ON ideas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ideas" ON ideas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ideas" ON ideas
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ideas" ON ideas
  FOR DELETE USING (auth.uid() = user_id);
```

(Rinse and repeat for all tables.)

### 3.3 Real-time Subscriptions

The React client subscribes to:
- `ideas` table → inbox updates live when new ideas arrive
- `listening_hits` table → new hits appear without refresh
- `content_plans` table → calendar updates when plans change

### 3.4 Indexes

```sql
CREATE INDEX idx_ideas_user_status ON ideas(user_id, status);
CREATE INDEX idx_ideas_user_created ON ideas(user_id, created_at DESC);
CREATE INDEX idx_content_plans_user_date ON content_plans(user_id, scheduled_date);
CREATE INDEX idx_listening_hits_topic ON listening_hits(topic_id, captured_at DESC);
```

---

## 4. Data Flow Diagrams

### 4.1 Idea Capture (Telegram)

```
User forwards Instagram link on Telegram
  → Telegram API → webhook → Vercel /api/webhooks/tg
  → Validate bot token
  → Extract URL + message text + sender ID
  → Lookup user by telegram_chat_id in profiles
  → INSERT into ideas (source_url, context_text, source_platform, user_id)
  → Queue enrichment job
  → Reply to user: "Saved! 📌"
  → Supabase Realtime → Dashboard updates live
```

### 4.2 Idea Enrichment

```
New idea created (trigger or async)
  → Vercel function /api/enrich
  → Fetch URL → extract og:title, og:image, og:description
  → If Instagram/YouTube/X → call appropriate metadata API
  → Call OpenRouter with Claude Haiku:
      "Summarize this content in 2 sentences for a creator to reference later: {title} {description}"
  → UPDATE ideas SET title, ai_summary, og_image_url, metadata
  → Supabase Realtime → Dashboard shows enriched card
```

### 4.3 Listening Cycle

```
Railway cron fires daily at 8am
  → Worker: FastAPI /run
  → Fetch active topics from Supabase
  → For each topic with frequency=daily AND last_run was >24h ago:
      subprocess.run: python3 scripts/last30days.py "<keywords>" --days=7 --store --quick
  → Bridge: read last30days SQLite → find new hits → INSERT into listening_hits
  → UPDATE listening_topics SET last_run_at
  → Supabase Realtime → Dashboard shows new hits
```

---

## 5. Security Model

| Concern | Solution |
|---|---|
| API auth | Supabase JWT validation on API routes; telegram secret token |
| Database access | RLS on all tables; service role bypass only for worker |
| Instagram OAuth | Composio manages tokens; we never store IG credentials |
| Telegram bot | Bot token as env var; webhook URL validated by Telegram |
| Enrichment API key | OpenRouter key server-side only |
| Webhook verification | Secret tokens for both IG and TG webhooks |
| Rate limiting | Supabase handles it; API routes have basic throttle |
| XSS | React handles it by default; sanitize any user HTML |
| CSRF | Supabase SDK handles tokens; API routes are stateless |

---

## 6. Environment Variables

```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # Worker only

# Telegram
TELEGRAM_BOT_TOKEN=

# Composio (Instagram)
COMPOSIO_API_KEY=

# OpenRouter (AI enrichment)
OPENROUTER_API_KEY=

# Vercel
VERCEL_URL=                   # Auto-set by Vercel

# Worker
LAST30DAYS_MEMORY_DIR=/data/last30days
```

---

## 7. Directory Structure

```
content-planner/
├── app/                    # React SPA (frontend)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Supabase client, utils
│   │   ├── contexts/       # Auth, theme contexts
│   │   └── main.jsx
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── api/                    # Vercel serverless functions
│   ├── ideas/
│   ├── plans/
│   ├── topics/
│   └── webhooks/
├── worker/                 # Listening worker (Python)
│   ├── main.py
│   ├── bridge.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── vendor/
├── supabase/               # Database migrations & seed
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── scripts/
│   ├── learning/           # Learning loop system
│   │   ├── capture.mjs     # Capture learnings from sessions
│   │   ├── review.mjs      # Weekly review summary
│   │   ├── adapt.mjs       # Apply learnings as PRs/issues
│   │   └── templates/      # Templates for each capture type
│   ├── dev.mjs             # Local dev startup
│   └── deepseek.mjs        # Chat utility (existing)
├── docs/                   # All documentation
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── PHASES.md
│   ├── LEARNING.md
│   ├── DECISIONS.md
│   └── journal/            # Learning journal entries
├── .github/
│   └── workflows/
│       └── deploy.yml      # CI/CD
├── .env.example
├── .gitignore
└── package.json
```

---

## 8. Cost Breakdown (Self-Use)

| Service | Free Tier | Our Usage | Cost |
|---|---|---|---|
| Vercel | 100GB bandwidth, 100GB-hrs functions | Well within limits | $0 |
| Supabase | 500MB DB, 2GB bandwidth, 50k MAU | Well within limits | $0 |
| Composio | Generous free tier | 100-500 DM webhooks/month | $0 |
| Railway | 500 hrs/month, 512MB RAM | ~720 hrs needed → slight overage | ~$1-2/mo |
| OpenRouter (Claude Haiku) | Pay as you go | ~$0.50/month for enrichment | ~$0.50 |
| Telegram Bot API | Free | Unlimited | $0 |
| **Total** | | | **~$2/month** |

Alternative to Railway: fly.io free tier (3 shared-cpu VMs, 256MB each, 3GB persistent volume). More generous. Worth evaluating.

---

*This architecture doc reflects current decisions. See DECISIONS.md for the why behind each choice.*
