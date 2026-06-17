# Vercel deployment learned — Node.js runtime NOT Web Request, password auth beats magic link

**Date:** 2026-06-16
**Session type:** debugging
**Phase:** 0
**Mood:** 😤 frustrated → 💡 enlightened

---

## Context

Deployed the full app to Vercel. Every API route returned 500. Took 4 debug cycles to figure out why.

## What happened?

Vercel's Node.js runtime passes **IncomingMessage + ServerResponse** (Node.js style), NOT the Web fetch-api Request/Response objects. All my API handlers used `req.headers.get()`, `new Response()`, `await req.json()` — none of these exist on Node streams.

The fix was an adapter layer (`api/_w.js`) that wraps `(nodeReq, nodeRes)` into Web-compatible `{ req, res }` objects with:
- `req.headers.get(name)` → reads `nodeReq.headers[name.toLowerCase()]`  
- `await req.json()` → reads the stream into a buffer and parses
- `res.json(data, status)` → calls `nodeRes.writeHead` + `nodeRes.end`

Also: Supabase free tier has a **4-5 email/hour rate limit** on magic links. `over_email_send_rate_limit` blocked us after a few test attempts. Switched to password auth which has no rate limit and is actually faster for users.

Also: Vercel's `_w.js` adapter pattern matched what the taste system already told me:
> "Vercel Node.js runtime passes IncomingMessage (not Web Request) to API handlers — use an adapter that wraps (nodeReq, nodeRes) into Web-compatible {req, res} objects"

This was already a taste preference and I didn't apply it until it broke.

## What I learned

1. **Always apply taste preferences before deploying.** The Vercel adapter taste rule existed but I wrote handlers using Web Request API anyway. Cost: 4 broken deploy cycles.
2. **Supabase free tier email rate limit is ~5/hr.** Password auth is the correct default for dogfooding. Magic link is nice for SaaS onboarding later.
3. **Vercel aliases (`apcp.vercel.app`) can have propagation delays.** The alias showed 401s for a few minutes while routing settled.
4. **Firecrawl in Vercel functions works via REST API, not CLI.** The `api/listening/run.js` uses `fetch()` to `api.firecrawl.dev/v1/search` — not `execSync('firecrawl')`.

## What should change?

- [x] Rewrote all 10 API handlers with `_w.js` adapter
- [x] Added password login with sign-up flow
- [ ] Add Supabase rate limit handling note to docs
- [ ] Register apcp.vercel.app in Supabase redirect URLs dashboard

## Tags

#api #architecture #supabase #bug #vercel
