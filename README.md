# ContentPlanner

> **Never lose an idea again. Always know what your audience wants to hear next.**

An operating system for a content creator's ideation-to-publishing workflow. Combines instant inspiration capture (Telegram bot + Instagram DM) with social listening (powered by [last30days-skill](https://github.com/mvanhorn/last30days-skill)) and a visual content calendar.

**Status:** Pre-Phase 0 — Planning & Architecture Complete

---

## What Problem Does This Solve?

1. **Inspiration loss:** Creators see inspiring content daily but have no frictionless way to capture it. By the time they open Notion, the spark is gone.
2. **Content blindness:** Creators plan in a vacuum without knowing what their community is actually discussing.

## How It Works

```
1. Browse Instagram → tap Share → send reel to your planner bot
2. Idea appears in your inbox instantly (with AI summary + metadata)
3. Drag ideas onto a calendar → plan your content week
4. Background worker monitors Reddit/HN/YouTube for your topics
5. New trends appear in your listening dashboard → capture as ideas
```

---

## Quick Start

```bash
# Read the planning docs first
cat docs/PRD.md          # Product vision & user stories
cat docs/ARCHITECTURE.md  # System design & tech stack
cat docs/PHASES.md        # Execution roadmap
cat docs/LEARNING.md      # Learning loops system
cat docs/DECISIONS.md     # Decision log

# Learning loops (capture learnings after every session)
npm run learn capture
npm run learn review
npm run learn adapt

# Start building (Phase 0)
cd app && npm init vite@latest .
```

---

## Directory Structure

```
content-planner/
├── docs/                  📄 Planning & documentation
│   ├── PRD.md             Product Requirements Document
│   ├── ARCHITECTURE.md    System design & tech decisions
│   ├── PHASES.md          Execution roadmap
│   ├── LEARNING.md        Learning loops system
│   └── DECISIONS.md       Decision log
├── app/                   🖥️  React + Vite frontend
├── api/                   🔌 Vercel Serverless Functions
├── worker/                ⚙️  Listening worker (Python)
├── supabase/              🗄️  Database migrations & seed
├── scripts/
│   ├── learning/          🧠  Learning loop system
│   │   ├── capture.mjs    Record session learnings
│   │   ├── review.mjs     Weekly pattern synthesis
│   │   ├── adapt.mjs      Turn insights into action
│   │   └── taste.mjs     Code preferences for AI agents
│   └── templates/         📋 Structured learning templates
└── .github/workflows/     🚀 CI/CD (Vercel deploy)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend API | Vercel Serverless Functions |
| Database | Supabase (Postgres + Auth + Realtime) |
| Capture | Telegram Bot API + Composio (Instagram) |
| Listening | `last30days-skill` (Python, 43k+ stars) |
| AI Enrichment | OpenRouter (Claude Haiku) |
| Worker Host | Railway or fly.io |

---

## Phases

| Phase | Goal | Status |
|---|---|---|
| 0 — Foundation | Repo setup, auth, DB schema | ⬜ Not started |
| 1 — Dogfood | Manual capture + inbox + calendar | ⬜ Not started |
| 2 — Universal Capture | Telegram bot + Instagram DM | ⬜ Not started |
| 3 — Social Listening | Automated topic monitoring | ⬜ Not started |
| 4 — Polish & Scale | PWA, tags, export, SaaS prep | ⬜ Not started |

---

## Principles

- **Dogfood first.** Build for yourself. Validate with real usage. SaaS comes later.
- **Learn in public.** Every session captured. Weekly reviews. Decisions documented.
- **Ship incrementally.** Each phase must work end-to-end before starting the next.
- **Cheap first.** Stay on free tiers until revenue justifies paid services.

---

## License

MIT
