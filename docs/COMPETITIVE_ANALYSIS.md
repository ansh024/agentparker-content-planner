# Competitive Analysis & Product Roadmap

> **Method:** G2, Capterra, Trustpilot, Reddit, Product Hunt reviews + Plann hands-on review  
> **Date:** 2026-06-16

---

## 1. Competitor Pain Points (What Users Complain About)

### Planoly — G2/Capterra/Trustpilot
| Pain Point | Evidence | Severity |
|---|---|---|
| Unreliable posting | "Auto posting is unreliable, errors surface during posting not drafting — wasting time and resources and often missing posts." (Capterra) | 🔴 Critical |
| Zero customer support | "Frustrating. Unreliable. NO Support. Tech issues never resolved. No Communication." (Trustpilot) | 🔴 Critical |
| Missing AI/integrations | "I wish it had more capabilities — potentially an integration with Canva or ChatGPT." (Capterra) | 🟡 Moderate |
| Post disappearing | "My content wouldn't post or it would disappear and it was just very confusing to use." (SelectHub) | 🔴 Critical |
| **No idea capture** | Zero mention of saving inspiration or capturing ideas. Entirely scheduling-only. | 🔴 Gap |

### Plann — SocialRails hands-on review + App Store
| Pain Point | Evidence | Severity |
|---|---|---|
| No X/Twitter/Bluesky | "If X/Twitter is part of your social media strategy, you'll need a separate tool entirely." | 🟡 Platform gap |
| Basic AI | "AI caption generator is basic. Doesn't offer full-length post generation, video scripts, or bulk generation." | 🟡 Moderate |
| Free plan useless | "Free plan has strict upload limits that make it impractical for regular use." | 🟡 Onboarding friction |
| Multi-brand pricing | "Per-brand pricing adds up fast. For agencies managing multiple clients, this gets expensive." | 🟡 Moderate |
| **No idea capture** | Focuses on scheduling and grid aesthetics. No capture/ideation workflow at all. | 🔴 Gap |

### Planable — Capterra
| Pain Point | Evidence | Severity |
|---|---|---|
| No idea parking lot | "I wish there was a better way to add ideas for future posts or make notes of holidays/events." — THIS IS EXACTLY OUR USE CASE | 🔴 Direct gap |
| Image quality | "HATE that the quality is so bad and you limit the quality of uploads on images." | 🟡 Moderate |
| Pricing | "Pricing is the single most cited complaint across the review set." (G2) | 🟡 Consistent |

### Publer — Capterra
| Pain Point | Evidence | Severity |
|---|---|---|
| Facebook profile limitation | "The only con is inability to post automatically to your own Facebook profile." (platform limit, not Publer's fault) | 🟢 Minor |
| **No idea capture** | Focused entirely on scheduling + analytics. No inspiration save flow. | 🔴 Gap |

---

## 2. Reddit — The Voice of the User

### r/SocialMediaManagers: Tools for Content Planning
> "I'm currently using Google Sheets to plan and organize my content... I recently tried Notion, but found it a bit limiting when it comes to adding images directly into the calendar."

**Insight:** Solo creators are still on spreadsheets. Even Notion isn't working for them because it can't handle rich media well in calendar views.

### r/marketing: Where do you store content ideas/accounts?
A dedicated thread asking exactly this. The fact that this thread exists proves our market.

### r/Notion: "Spent weeks creating the perfect planner & haven't touched it in over a month"
**Insight:** Notion fatigue is real. The setup burden is enormous — people spend more time building the system than using it. Our product needs zero setup.

### r/Design: How do you save your inspiration?
> Comments describe: "Instagram saved collections", "Pinterest boards", "screenshots in camera roll that I never look at again", "bookmark folders organized by project"

**Insight:** Inspiration saving is fragmented across platform-native tools that don't talk to each other. None of them connect to a planning workflow.

---

## 3. The Core Insight: What EVERY Competitor Misses

Every social media scheduler on the market assumes:
- You already know **what** to post
- You just need help with **when** and **how** to publish

**Nobody solves the upstream problem: WHERE DO IDEAS COME FROM?**

The entire market is built for execution, not inspiration. The user journey is:
```
[No tool] → Have idea → Open scheduler → Schedule post → Publish
     ↑
   This gap is our product
```

ContentPlanner fills the gap:
```
[See inspiring content] → 2-tap capture → Inbox → Plan → Schedule → Publish
                                            ↑
                                       Our product
```

---

## 4. Pricing Analysis of Competitors

| Tool | Free tier | Starting paid | What free gets you |
|---|---|---|---|
| Planoly | Yes (limited) | $16/mo | Limited uploads, basic planning |
| Plann | Yes (very limited) | $12.50/mo | Too restricted for real use |
| Publer | Yes (generous) | $12/mo | 3 accounts, basic scheduling |
| Planable | Yes (limited) | $15/mo per user | 1 workspace |
| Later | Yes (limited) | $25/mo | 1 social set, limited posts |
| Buffer | Yes | $6/mo per channel | 3 channels, planning tools |

**Our opportunity:** The free tiers are all limited by post count or platforms. We could offer a generous free tier limited by *captured ideas per month* (e.g., 50 free, then pay) — a metric no competitor uses. It's aligned with our unique value prop.

---

## 5. Updated Product Roadmap (Based on Research)

### Phase 1 — Dogfood (Now)
**What we build:**
- Manual idea capture (URL paste) + context notes
- Idea inbox with filters
- Simple calendar
- Supabase auth + realtime

**Why this order:** The Planable user explicitly said "I wish there was a better way to add ideas for future posts." This is the #1 gap across all tools. Validate that solving it matters before building anything else.

### Phase 2 — Instant Capture
- Telegram bot (funded by Composio-free alternative)
- Instagram DM via Composio
- Mobile-optimized capture UX

**Validation gate:** Am I using it daily instead of Notion? Am I capturing ≥5 ideas/day?

### Phase 3 — Social Listening
- `last30days-skill` worker on Railway/fly.io
- Topic dashboard with trend hits
- "Capture as idea" from listening results

**Why this matters:** Every competitor shows you what YOU scheduled. Nobody shows you what YOUR AUDIENCE is talking about. This is our second moat.

### Phase 4 — AI Enrichment (acceleration)
- Auto-summarize saved links
- Suggest content angles based on saved inspiration
- Cluster related ideas
- Content brief generation from idea cluster

**Why this matters:** Plann and Planoly both have "basic AI" as a complaint. We can leapfrog by making AI do the real work — turning saved inspiration into publishable briefs.

### Phase 5 — SaaS Launch
- Multi-tenant hardening
- Stripe subscriptions
- Landing page
- Free tier: 50 ideas/month, 2 listening topics
- Paid tier: unlimited ideas, 10 topics, AI enrichment
- Agency tier: multi-brand, team collaboration

---

## 6. Strategic Differentiators (Our Moats)

1. **Capture-first, not schedule-first.** Every competitor starts with a calendar. We start with an inbox. This fundamentally changes the user's mental model from "what should I post today?" to "what have I already found worth posting?"

2. **Listening as a feature, not a separate product.** Social listening tools cost $100+/month (Sprout Social, Brandwatch). We bundle it as part of the ideation workflow. You don't just plan — you discover.

3. **Telegram bot as universal capture.** No account type restrictions. Works for Instagram, YouTube, Twitter, Reddit, TikTok — any link, any platform. Competitors require you to be inside their app.

4. **Zero setup.** Notion requires weeks of template building. Our inbox works immediately — paste a link, it's saved. The learning curve is one action.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Instagram API limits (200 DM/hr, Business account required) | Telegram is primary capture. IG is secondary/optional. |
| `last30days-skill` is Python, our stack is JS | Separate worker service. Already designed for this. |
| Competitors could add idea capture | They're all calendar-first. Adding capture would require re-architecting their UX. Incumbent's dilemma. |
| Solo creator market is price-sensitive | Generous free tier. Monetize via AI features and listening — things competitors charge extra for. |
| Mobile capture friction if app isn't native | Telegram bot is already on every phone. No app install needed. This is the stealth advantage. |

---

## 8. What I'm Confident About

- **The problem is real.** Planable users explicitly ask for it. Reddit threads exist about it. Every creator has screenshots in their camera roll they'll never use.
- **The gap is wide.** Not a single scheduling tool does idea capture. Social listening is $100+/month enterprise. Nobody combines them.
- **The Telegram bot strategy is correct.** No account restrictions, works for any link type, already on every phone. It's the Trojan horse that bypasses every platform's API limitations.
- **"Inbox first, calendar second" is the right mental model.** It differentiates us from every competitor in one sentence.

---

## 9. What I'd Adjust Based on This Research

1. **Phase 1 should include the Telegram bot sooner.** Reading Reddit threads about "where do you store ideas" makes it clear the capture workflow is the whole product. Scheduling is secondary.

2. **AI enrichment should move up.** Planable users want idea parking. If we can auto-summarize and suggest content angles, we're not just a capture tool — we're a thinking partner. This is what Notion can't do.

3. **Mobile-first from day one.** Every capture happens on mobile. If the dashboard isn't usable on a phone, we've lost. The Telegram bot is a good bandage, but the inbox/calendar must work on mobile.

4. **Free tier should be generous on ideas, not posts.** Our competitors limit posts. We should limit monthly ideas (50 free, unlimited paid). It's aligned with our value prop and harder for competitors to copy.
