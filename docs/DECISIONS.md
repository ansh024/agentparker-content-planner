# Decision Log — ContentPlanner

> **Purpose:** Every significant architecture, product, or technical decision is recorded here with its rationale.  
> **Principle:** Anyone (including future-you) should understand WHY something was chosen, not just WHAT was chosen.

---

## Template

```markdown
### DEC-###: [Short title]

**Date:** YYYY-MM-DD
**Status:** [proposed | decided | superseded]
**Supersedes:** [DEC-### if replacing a previous decision]

**Context:**
[What was the situation? What problem were we solving?]

**Options considered:**
1. Option A — [brief description]
2. Option B — [brief description]
3. Option C — [brief description]

**Decision:**
[What did we choose and why?]

**Consequences:**
- ✅ Positive: [what we gain]
- ⚠️ Negative: [what we give up / risks / added complexity]

**Alternatives not chosen & why:**
- Option X rejected because [reason]
```

---

## Active Decisions

### DEC-001: Vercel + Supabase over Next.js full-stack

**Date:** 2026-06-16
**Status:** decided

**Context:**
Need a hosting platform for the React frontend and API routes. Initially considered Next.js but wanted maximum free tier mileage and simplicity.

**Options considered:**
1. Next.js on Vercel — full framework, SSR, API routes bundled
2. Vite + React on Vercel static + separate Express backend
3. Vite + React on Vercel + Vercel Serverless Functions for API

**Decision:**
Option 3 — Vite + React (static) + Vercel Serverless Functions. Supabase handles auth and real-time, so we don't need SSR or a heavy backend framework. Vercel functions are free-tier generous (100GB-hrs) and deploy from the same repo.

**Consequences:**
- ✅ Faster builds, smaller bundles, no SSR complexity
- ✅ Supabase JS client works directly in browser for most CRUD
- ✅ API functions only for webhooks and server-side operations
- ⚠️ No SSR means no server-rendered meta tags (not needed for a dashboard app)
- ⚠️ Must validate JWT manually in API functions (minor overhead)

---

### DEC-002: Telegram bot as primary capture over Instagram DM

**Date:** 2026-06-16
**Status:** decided

**Context:**
The initial vision was Instagram DM as the capture method. Research revealed Instagram API limitations — requires Business/Creator account, connected Facebook Page, 200 DM/hour rate limit, and Meta's unpredictable API policy.

**Options considered:**
1. Instagram DM only (via Composio)
2. Telegram bot only
3. Both — Telegram first, Instagram later

**Decision:**
Option 3 — Build Telegram bot in Phase 2 as the primary capture channel, Instagram DM as an optional add-on. Telegram has zero account restrictions, a free API, supports forwarding any link type, and has 30-minute setup time vs. hours for Instagram OAuth.

**Consequences:**
- ✅ Universal link forwarding (works for Reels, YouTube, tweets, Reddit, any URL)
- ✅ No account type restrictions — any user can use it
- ✅ Faster build time, lower maintenance
- ⚠️ Requires Telegram app on phone (most creators have it, but adds a step)
- ⚠️ Two taps instead of one (share → Telegram bot vs. share → @plannerbot on IG)

---

### DEC-003: last30days-skill over building custom listening

**Date:** 2026-06-16
**Status:** decided

**Context:**
Need a social listening engine that searches Reddit, YouTube, HN, Twitter for trending topics. Building from scratch would require individual API integrations, rate limit handling, search ranking, and synthesis.

**Options considered:**
1. Build custom Python scrapers for each platform
2. Use `mvanhorn/last30days-skill` (43.2k stars, MIT license)
3. Use a paid social listening API (Brandwatch, Sprout Social — $100+/month)

**Decision:**
Option 2 — Use last30days-skill as a vendored dependency in the listening worker. It already handles 12+ platforms, parallel search, ranking by engagement, trend monitoring via watchlist, and SQLite persistence. Battle-tested with 1,012 tests.

**Consequences:**
- ✅ Massive time savings — months of platform integrations done
- ✅ MIT license, no restrictions
- ✅ Active maintenance, 631 commits, large community
- ✅ Watchlist + briefing systems already built
- ⚠️ Python dependency requires separate worker (can't run in Vercel)
- ⚠️ Needs API keys for some sources (ScrapeCreators for Instagram/TikTok)
- ⚠️ We're adding a submodule dependency — must track upstream changes

---

### DEC-004: Supabase over raw Postgres or Firebase

**Date:** 2026-06-16
**Status:** decided

**Context:**
Need a database with auth, real-time subscriptions, and file storage. Evaluating managed options vs. self-hosted.

**Options considered:**
1. Supabase (managed Postgres + Auth + Realtime + Storage)
2. Firebase (Firestore + Auth)
3. Railway Postgres + custom auth + Pusher for real-time

**Decision:**
Option 1 — Supabase. Postgres (not NoSQL), built-in auth with magic link and OAuth, real-time subscriptions via WebSockets, RLS for security, and generous free tier (500MB DB, 50k MAU). The entire stack is one product, not 4 separate services.

**Consequences:**
- ✅ One vendor for auth, database, real-time, and storage
- ✅ RLS means security is declarative, not in application code
- ✅ Real-time subscriptions are trivial to set up
- ✅ Free tier covers solo use for months
- ⚠️ Vendor lock-in (but it's Postgres — migration is possible)
- ⚠️ Supabase JS client is heavy (~50KB gzipped) — acceptable for a dashboard

---

### DEC-005: Composio for integrations over direct APIs

**Date:** 2026-06-16
**Status:** decided

**Context:**
Need Instagram OAuth flow and webhook handling. Building direct Meta Graph API integration requires Facebook app review, OAuth server, webhook verification, and ongoing compliance.

**Options considered:**
1. Build direct Meta Graph API integration
2. Use Composio Instagram toolkit
3. Skip Instagram entirely

**Decision:**
Option 2 — Composio for Instagram integration (as a secondary channel, not primary). Free tier is generous. They handle OAuth, token refresh, webhook management. If they become expensive or unreliable, we can build direct at that point.

**Consequences:**
- ✅ Days of work saved on OAuth + webhook setup
- ✅ Token management handled by them
- ⚠️ Dependency on third-party service (pricing changes, reliability)
- ⚠️ Adds latency — DM goes Instagram → Meta → Composio → our webhook → Supabase
- ⚠️ Platform risk: if Instagram API changes, depends on Composio's response time

---

### DEC-006: OpenRouter for AI enrichment over direct API

**Date:** 2026-06-16
**Status:** decided

**Context:**
Need AI-powered idea enrichment — summarize source content, generate titles. Need cheap, fast inference.

**Options considered:**
1. Direct OpenAI API (GPT-4o-mini)
2. Direct Anthropic API (Claude Haiku)
3. OpenRouter (access to multiple models)

**Decision:**
Option 3 — OpenRouter with Claude Haiku. Haiku is cheap ($0.25/M input, $1.25/M output), fast, and good enough for summarization. OpenRouter gives us model flexibility without changing integration code.

**Consequences:**
- ✅ Model flexibility — can switch to cheaper/better model anytime
- ✅ No vendor lock-in to OpenAI or Anthropic
- ✅ Pay-as-you-go, no monthly minimum
- ⚠️ OpenRouter adds a reliability dependency
- ⚠️ Slightly higher per-token cost than direct (markup is marginal)

---

## Superseded Decisions

*(None yet — project is new.)*

---

## Decision Candidates

*(See decision-candidates.md in the journal for pending items.)*

---

*Update this file whenever you make a significant choice. Link to the learning journal entry that prompted it.*
