-- Cron sweeper support: the every-minute sweep (app/api/cron/trustclaw/route.ts)
-- claims jobs on `enabled = true AND "nextRunAt" <= now AND "lockedAt" IS NULL`,
-- but the only index was (instanceId, nextRunAt) - a full scan per tick.
-- This partial index matches the hot predicate exactly. Partial (WHERE) indexes
-- cannot be expressed via @@index in the Prisma schema, so this one lives here
-- as raw SQL only; schema.prisma is intentionally unchanged for it.
--
-- NOTE on CONCURRENTLY: Prisma Migrate runs each migration inside a transaction,
-- where CREATE INDEX CONCURRENTLY is disallowed - so these use plain
-- CREATE INDEX IF NOT EXISTS, the same approach as the existing
-- 20260602120100_memory_hnsw_index migration. The tables are small
-- (single-tenant instances), so the brief write lock is acceptable.
CREATE INDEX IF NOT EXISTS "composio_claw_cron_job_enabled_next_run_idx"
  ON "composio_claw_cron_job" (enabled, "nextRunAt")
  WHERE "lockedAt" IS NULL;

-- Always-inject bucket reads (getBucketMemories in agent/tools/memory-search.ts)
-- run WHERE "instanceId" + category ORDER BY "createdAt" DESC LIMIT 25 on every
-- agent turn. Mirrored in schema.prisma via @@index(..., map: ...).
CREATE INDEX IF NOT EXISTS "composio_claw_memory_instance_category_created_idx"
  ON "composio_claw_memory" ("instanceId", category, "createdAt" DESC);
