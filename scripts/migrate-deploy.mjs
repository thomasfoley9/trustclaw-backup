// Runs `prisma migrate deploy` over the DIRECT (unpooled) connection when one
// is configured. Pooled endpoints (Neon pgbouncer - the conventional
// DATABASE_URL on Vercel) cannot run migrations; use the unpooled URL.
// The Vercel-Neon integration injects this as DATABASE_URL_UNPOOLED (and
// POSTGRES_URL_NON_POOLING); a hand-set DIRECT_DATABASE_URL wins if present.
import { spawnSync } from "node:child_process";

const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;
if (!url) {
  console.error("migrate-deploy: no DATABASE_URL/DIRECT_DATABASE_URL set");
  process.exit(1);
}
const res = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(res.status ?? 1);
