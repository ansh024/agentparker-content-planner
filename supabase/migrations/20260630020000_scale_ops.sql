-- M4: Scale & Content Ops
-- See docs/plans/scaling-hub/05-scale-ops.md
--
-- This layer is mostly orchestration over existing tables (read aggregations +
-- batch fan-out), so the only schema change is a per-user daily target.
-- The engagement_queue / batch comment queue was CUT at the autoplan gate
-- (slop-by-construction) and is deliberately NOT created here.

alter table profiles add column if not exists daily_targets jsonb;  -- e.g. {"posts":2,"comments":10}
