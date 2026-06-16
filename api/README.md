# API Routes

This directory contains Vercel Serverless Functions.

## Structure

```
api/
├── ideas/          CRUD for captured ideas
├── plans/          Content calendar CRUD
├── topics/         Listening topic management
├── webhooks/       Telegram + Instagram webhook receivers
└── enrich/         URL metadata + AI enrichment
```

Each directory has an `index.js` or `[id].js` file that exports a handler function.

## Conventions

- Validate Supabase JWT on every request
- Use `@supabase/supabase-js` with service role for sensitive operations
- Return JSON with appropriate status codes
- Rate limit webhook endpoints
