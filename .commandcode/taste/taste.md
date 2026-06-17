# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# architecture
- Use Firecrawl REST API (api.firecrawl.dev/v1/search) as the social listening engine instead of last30days-skill — call directly from Vercel serverless functions, no external worker needed. Confidence: 0.75
- Include a karpathy-style skills/learnings system in the project repo structure for continuous learning loops. Confidence: 0.70

# vercel
- Vercel Node.js runtime passes IncomingMessage (not Web Request) to API handlers — use an adapter that wraps (nodeReq, nodeRes) into Web-compatible {req, res} objects with headers.get(), await req.json(), and res.json()/res.empty() helpers. Confidence: 0.80

# workflow
- Create a proper planning and execution document before scaffolding code. Confidence: 0.65

- Vercel Node.js runtime uses IncomingMessage+ServerResponse, not Web Request/Response — use _w.js adapter wrapping (nodeReq, nodeRes) into {req, res} with headers.get(), res.json(). Confidence: 0.70
- Use password login (email+password) as primary auth — magic-link-only auth creates friction and hits Supabase free tier rate limit (5 emails/hr). Confidence: 0.70
- API routes deployed on Vercel must use nodeReq/nodeRes adapter pattern from _w.js — never call req.headers.get() or new Response() directly. Confidence: 0.70
# supabase
- Use Supabase CLI for database migrations instead of the web SQL editor. Confidence: 0.65
- Provide password-based login alongside magic links — magic-link-only auth creates friction and is prone to email rate limiting (429). Confidence: 0.75

# observability
- Add logging and observability throughout the app to make debugging easier. Confidence: 0.70

# error-handling
- User-facing errors must show actual context and readable messages rather than raw system-generated errors. Confidence: 0.70

# mobile
- This is a mobile-first app — design and test for mobile viewports (375px) first, then scale up to tablet/desktop. Confidence: 0.70
- Interactive elements (buttons, links, inputs) must have minimum 44px touch targets (min-h-[44px] min-w-[44px]) for mobile accessibility. Confidence: 0.70

