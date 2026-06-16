# Product Requirements Document — ContentPlanner

> **Status:** Draft v0.1  
> **Author:** Solo founder, dogfooding then SaaS  
> **Last updated:** 2026-06-16

---

## 1. Problem Statement

### 1.1 The Two Problems

**Problem A — Inspiration Loss**
Content creators browse Instagram, Reddit, YouTube, Twitter daily. They encounter dozens of reels, posts, threads that spark ideas. But there's no frictionless way to capture that inspiration in the moment. The current workflow is broken:

1. See a reel → think "I should make something like this"
2. Copy link (if you even can on mobile)
3. Open Notion → find the right page → paste → add context
4. By step 3, the spark is already fading

Result: 90% of inspiration is lost. The friction between "aha" and "saved" is too high.

**Problem B — Content Blindness**
Creators plan content in a vacuum. They don't know what their community is actually discussing this week. Existing social listening tools (Sprout Social, Brandwatch) cost $100+/month and are built for enterprise marketing teams, not individual creators.

Result: Content is created based on gut feel, not data. Timing is missed. Relevance suffers.

### 1.2 Why Existing Solutions Fail

| Tool | Does well | Missing |
|---|---|---|
| Notion/Trello | Flexible organization | No capture speed, no listening |
| Planoly/Plann/Publer | Calendar scheduling | Only schedules what you already have, no idea capture |
| CreatorFlow | DM automation for outbound | No inbound capture, no planning |
| SaveDay/MeeMoo (Telegram bots) | Quick bookmarking | Generic — not built for content creators |
| Sprout Social/Brandwatch | Enterprise social listening | $100+/month, overkill for solo creators |

**The gap:** Nobody combines instant inspiration capture + content planning + social listening in one tool.

---

## 2. Product Vision

ContentPlanner is the operating system for a content creator's ideation-to-publishing workflow.

**One-liner:** Never lose an idea again, and always know what your audience wants to hear next.

---

## 3. Core User Flows

### Flow 1 — Capture (2 taps)

```
[Browsing Instagram] → Tap Share → Send to @mycontentplanner
  → [Optional: type context] → Done
  → Backend: DM received → webhook → store in inbox → AI enriches
```

### Flow 2 — Plan (drag & drop)

```
[Open dashboard] → See Idea Inbox (all captured ideas)
  → Drag idea to calendar date
  → Idea moves from "new" → "planned"
  → Calendar fills up visually
```

### Flow 3 — Listen (automated)

```
[Background worker runs daily]
  → last30days-skill searches Reddit, HN, YouTube for user's topics
  → Trending hits appear in Listening dashboard
  → User scrolls, finds inspiration → captures into inbox with one click
```

---

## 4. User Stories

| ID | As a... | I want to... | So I can... | Priority |
|---|---|---|---|---|
| US-01 | Creator browsing social media | Send any post/reel to my planner in 2 taps | Never lose an idea again | P0 |
| US-02 | Creator sending an idea | Attach a quick voice/text note for context | Remember WHY I saved this | P0 |
| US-03 | Creator at my desk | See all captured ideas in a visual inbox | Process them when I'm ready to plan | P0 |
| US-04 | Content planner | Drag ideas onto a calendar | Build a week's content plan visually | P1 |
| US-05 | Content researcher | See what topics my community is talking about | Create relevant, timely content | P1 |
| US-06 | Creator on the go | Capture ideas from any platform (IG, Reddit, Twitter, web) | Not be limited to one source | P1 |
| US-07 | Content planner | See each idea enriched with AI summary + source metadata | Understand the idea without re-opening the source | P2 |
| US-08 | Power user | Tag and categorize ideas by content pillar | Keep a structured idea bank | P2 |
| US-09 | Content planner | Move ideas through a status pipeline (new → planned → drafting → published) | Track progress end to end | P2 |
| US-10 | Team lead | Share the content calendar with collaborators | Coordinate publishing across channels | P3 |

---

## 5. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Capture latency | < 5 seconds from DM send to inbox appearance (via Realtime) |
| Dashboard load time | < 2 seconds on cold start (Vercel edge) |
| Listening freshness | Topics checked daily; results available by 9am local time |
| Mobile UX | Dashboard must be fully usable on mobile (PWA target) |
| Auth security | Supabase Auth with RLS on all tables |
| Data residency | User data never leaves Supabase; listening uses last30days locally on worker |
| Cost per user (self) | $0/month (Vercel free, Supabase free, Railway free, Composio free) |

---

## 6. Platform & Integration Decisions

### 6.1 Capture Channels

| Channel | Implementation | Complexity | Risk |
|---|---|---|---|
| Instagram DM | Composio Instagram toolkit → webhook → Supabase | Medium | Requires Business/Creator account; Meta API is hostile |
| Telegram Bot | `node-telegram-bot-api` → webhook → Supabase | Low | No restrictions; universal link support |
| Web app manual | URL input + text note in React dashboard | Low | Fallback; exists for desktop-only users |

**Decision:** Build Telegram first (lowest risk, fastest). Instagram via Composio second. Manual paste always available.

### 6.2 Listening Engine

Using [`mvanhorn/last30days-skill`](https://github.com/mvanhorn/last30days-skill) (43.2k stars, MIT license):
- Python CLI that searches 12+ platforms in parallel
- `--store` flag persists to SQLite
- `watchlist.py` for scheduled recurring monitoring
- We wrap it in a Railway worker that syncs results to Supabase

**Alternative considered:** Building from scratch. Rejected — last30days is battle-tested, maintained, and the exact tool needed.

### 6.3 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite | Fast, mature, Vercel-optimized |
| Styling | Tailwind CSS | Rapid UI, small bundle |
| Backend API | Vercel Serverless Functions | Free tier, auto-scaling, same repo |
| Database | Supabase (Postgres + Auth + Realtime) | Managed Postgres, built-in auth, real-time subscriptions |
| File storage | Supabase Storage | Already in the ecosystem |
| Listening worker | Railway / fly.io free tier | Long-running Python processes (Vercel can't do this) |
| Integrations | Composio (Instagram) + node-telegram-bot-api | Pre-built OAuth, webhook management |
| AI enrichment | OpenRouter (Claude Haiku) | Cheap ($0.25/M tokens), good enough for summarization |
| CI/CD | GitHub Actions → Vercel deploy previews | Free, standard |

---

## 7. What We're NOT Building (Anti-scope)

- ❌ Social media scheduling/publishing (use Planoly/Publer for that — integrate later)
- ❌ Analytics dashboard (use platform-native analytics)
- ❌ Team collaboration (Phase 3+)
- ❌ Mobile native app (PWA covers it for now)
- ❌ AI content generation (idea enrichment only — not writing posts)
- ❌ Multi-tenant SaaS infrastructure (single-user until validated)

---

## 8. Success Metrics (for self-validation)

- [ ] I use it daily for 2 weeks without going back to Notion
- [ ] Capture latency feels instant (don't think about it)
- [ ] At least 5 ideas captured per day
- [ ] At least 1 content plan created per week from captured ideas
- [ ] Listening surface catches at least 2 things I wouldn't have found manually

If all 5 are true after 4 weeks → worth building as SaaS.

---

## 9. Open Questions

1. **Instagram account requirement:** Will requiring a Business/Creator account kill SaaS adoption? Should Telegram be the primary onboarding path?
2. **Mobile PWA vs. native app:** At what point does PWA become insufficient?
3. **AI enrichment depth:** How much AI processing per idea? Summary only? Suggested titles? Content brief generation?
4. **Monetization model:** Freemium (X ideas/month free, then pay)? Usage-based? Flat subscription?
5. **Data portability:** Should users be able to export their idea bank?

---

*This PRD is a living document. Update it when decisions change.*
