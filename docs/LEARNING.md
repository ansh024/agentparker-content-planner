# Learning Loops System — ContentPlanner

> **Inspired by:** Andrej Karpathy's approach to project documentation  
> **Principle:** Every action, error, decision, and insight is a learning opportunity.  
>   Capture it, review it, let it compound.

---

## Why a Learning System?

Building software generates an enormous amount of micro-knowledge that evaporates immediately:
- "Oh, THAT's how Supabase RLS works"
- "Instagram API requires a Facebook Page. Noted."
- "Tailwind's `group-hover` doesn't work across component boundaries"

Most of this is lost. You re-learn it next time you hit the same problem. Or worse — you make the same mistake again.

The learning loop closes this gap: **capture → review → adapt → improve.**

---

## The Three Loops

### Loop 1 — Session Capture (Every Session)

After every coding session, capture learnings. Takes 2 minutes.

```
scripts/learning/capture.mjs
```

This prompts you for:
1. **What did you work on?** (brief context)
2. **What went wrong / surprised you?** (the pain)
3. **What did you learn?** (the insight)
4. **What should change?** (the adaptation)

Output: A timestamped entry in `docs/journal/YYYY-MM-DD-<slug>.md`

### Loop 2 — Weekly Review (Every Week)

Every Sunday, review the week's learnings. Extracts patterns.

```
scripts/learning/review.mjs
```

This:
1. Gathers all journal entries from the past 7 days
2. Groups learnings by category (tech, product, process, user)
3. Flags recurring problems ("this happened 3 times this week")
4. Generates a weekly summary at `docs/journal/weekly-YYYY-MM-DD.md`
5. Extracts **decision candidates** — learnings that suggest a concrete change

### Loop 3 — Adaptation (When Ready)

When you have enough signal, turn learnings into action.

```
scripts/learning/adapt.mjs
```

This:
1. Reads the decision candidates file
2. Helps you turn them into:
   - A PRD update
   - An architecture decision (→ DECISIONS.md)
   - A code refactor task (→ GitHub issue or todo)
   - A documentation update
   - A taste preference (for AI agents working on this project)

---

## The Learning Journal

All learnings live in `docs/journal/`. Structure:

```
docs/journal/
├── 2026-06-16-initial-architecture.md
├── 2026-06-17-supabase-rls-policy-headache.md
├── 2026-06-18-telegram-bot-webhook-gotchas.md
├── ...
├── weekly-2026-06-22.md
├── weekly-2026-06-29.md
├── ...
├── decision-candidates.md        # Running list of things to change
└── applied/                       # Learnings that were acted on
    ├── 2026-07-01-switched-to-flyio.md
    └── ...
```

---

## Journal Entry Template

```markdown
# [Title — the key insight]

**Date:** 2026-06-16
**Session type:** [coding | debugging | planning | research | review]
**Phase:** [0 | 1 | 2 | 3 | 4]
**Mood:** [😤 frustrated | 🤔 confused | 💡 enlightened | 😌 smooth | 🔥 focused]

---

## Context

[What was I trying to do? 1-2 sentences.]

## What happened?

[What went wrong, or what surprised me. Be specific. Include error messages, unexpected behavior, URL to docs you read.]

## What I learned

[The actionable insight. What would I tell past-me?]

## What should change?

[ ] [Concrete action item — update docs, change config, refactor something, add to DECISIONS.md]
[ ] [Second action item]

## Tags

`#tech-stack` `#supabase` `#rls` `#architecture`
```

---

## Learning Categories (Tags)

Use these tags to make reviews useful. The review script groups by category.

| Tag | Category | Example |
|---|---|---|
| `#tech-stack` | Technology choices | "Next.js is overkill, Vite is faster" |
| `#api` | External API behavior | "Instagram API returns 400 if caption > 2200 chars" |
| `#ux` | User experience | "The drag-drop library breaks on mobile" |
| `#product` | Product decisions | "Users don't need tags — they need folders" |
| `#process` | Workflow/process | "I keep forgetting to run migrations before coding" |
| `#architecture` | System design | "Worker shouldn't be on Vercel — needs long-running" |
| `#bug` | Bug discovered | Specific bug with repro steps |
| `#documentation` | Docs gaps | "README doesn't mention the Instagram account requirement" |
| `#cost` | Cost/pricing | "OpenRouter enrichment costs $0.02 per idea" |
| `#user-research` | User insights | "My friend tried it and couldn't find the save button" |
| `#taste` | Code preferences | "Always use const over let in this project" |

---

## Decision Candidates

When a learning suggests a concrete change, it goes to `decision-candidates.md`. Format:

```markdown
### Candidate: [Short title]

**Source learning:** [link to journal entry]
**Category:** [tech-stack | api | ux | product | process]
**Status:** [proposed | decided | rejected | implemented]

**What change?**
[One sentence.]

**Why?**
[The evidence — link to journal entries, repeat occurrences.]

**Tradeoffs considered**
- Pro: ...
- Con: ...

**Decision:** [pending]

**Applied:** [YYYY-MM-DD, if implemented]
```

---

## Taste Integration

This project uses a taste system (`.commandcode/taste/`) for AI agent preferences. Some learnings will become taste entries that guide how AI agents work on this project.

When a learning is about **code conventions, patterns, or tool preferences**, use the taste system:

```bash
# Add a taste preference
node scripts/learning/taste.mjs add "Use const instead of let for non-reassigned variables"
```

This writes to `.commandcode/taste/taste.md` in the appropriate category with a confidence score.

The AI agent reads this file before working and applies the preferences.

---

## How to Use This System

### Daily (after any significant work)

```bash
npm run learn capture
```

Answer 4 quick prompts. Takes 2 minutes. Do it before you close the laptop.

### Weekly (Sunday evening)

```bash
npm run learn review
```

Read the summary. Move any strong candidates to `decision-candidates.md`.

### When you have 2+ decision candidates

```bash
npm run learn adapt
```

Review candidates, make decisions, apply changes.

### When you learn a code preference

```bash
npm run learn taste "Always validate Supabase RLS policies with a test query"
```

---

## Anti-Patterns (What NOT to do)

- ❌ **Don't skip capture.** "I'm too tired" is when you need it most. The most painful learnings fade fastest.
- ❌ **Don't write essays.** One insight per entry. 3-5 sentences max. It's a log, not a blog.
- ❌ **Don't hoard decision candidates.** If a learning is clear, apply it. Don't wait for review.
- ❌ **Don't capture opinions as facts.** "Vercel SUCKS" is not a learning. "Vercel functions timeout at 60s, so my worker can't run there" is.
- ❌ **Don't skip tags.** Untagged entries are invisible to the review system.

---

## Exit Criteria for the Learning System

The learning system is working if:
- [ ] Journal has at least 1 entry per coding session
- [ ] Weekly reviews happen (set a calendar reminder)
- [ ] At least 50% of decision candidates are resolved (accepted or rejected)
- [ ] The ARCHITECTURE.md and PRD.md are updated based on learnings (not stale)
- [ ] You can tell someone "here's what I learned building this" with specific examples

---

*The learning system itself is a learning. Adjust it as you use it.*
