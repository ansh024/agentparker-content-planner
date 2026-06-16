# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# architecture
- Use Firecrawl REST API (api.firecrawl.dev/v1/search) as the social listening engine instead of last30days-skill — call directly from Vercel serverless functions, no external worker needed. Confidence: 0.75
- Include a karpathy-style skills/learnings system in the project repo structure for continuous learning loops. Confidence: 0.70

# workflow
- Create a proper planning and execution document before scaffolding code. Confidence: 0.65

# supabase
- Use Supabase CLI for database migrations instead of the web SQL editor. Confidence: 0.65

# observability
- Add logging and observability throughout the app to make debugging easier. Confidence: 0.70

# error-handling
- User-facing errors must show actual context and readable messages rather than raw system-generated errors. Confidence: 0.70

# mobile
- This is a mobile-first app — design and test for mobile viewports (375px) first, then scale up to tablet/desktop. Confidence: 0.70
- Interactive elements (buttons, links, inputs) must have minimum 44px touch targets (min-h-[44px] min-w-[44px]) for mobile accessibility. Confidence: 0.70

