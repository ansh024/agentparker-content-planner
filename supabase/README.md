# Supabase Configuration

## Setup

```bash
supabase init
supabase link --project-ref <your-project-ref>
supabase db push
```

## Migrations

Create a new migration:
```bash
supabase migration new <name>
```

Apply migrations:
```bash
supabase db push
```

## Local Development

```bash
supabase start
```

This starts a local Postgres, Auth, and API server.

## Schema

The full schema is defined in migrations. See `docs/ARCHITECTURE.md` for the table designs.
