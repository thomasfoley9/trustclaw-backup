// Runs `prisma migrate deploy` over the DIRECT (unpooled) connection when one
// is configured. Pooled endpoints (Neon pgbouncer - the conventional
// DATABASE_URL on Vercel) cannot run migrations; use the unpooled URL.
// The Vercel-Neon integration injects this as DATABASE_URL_UNPOOLED (and
// POSTGRES_URL_NON_POOLING); a hand-set DIRECT_DATABASE_URL wins if present.
//
// Fail-closed by default: any migrate failure fails the build, so a deploy can
// never promote with unapplied migrations. The ONE escape hatch is
// MIGRATE_ALLOW_UNREACHABLE_SKIP=1, passed per-deploy via
// `vercel deploy --build-env ...` (never set on the project), for the case
// where the direct endpoint is down (e.g. a Neon incident) but every migration
// is already known to be applied. It only engages when the failure is
// specifically "can't reach the database" (P1001-class) - a real migration
// error still fails the build even with the flag set.
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

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;

let lastStatus = 1;
let lastOutput = "";
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const res = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url },
  });
  lastStatus = res.status ?? 1;
  lastOutput = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  process.stdout.write(res.stdout ?? "");
  process.stderr.write(res.stderr ?? "");
  if (lastStatus === 0) process.exit(0);

  const unreachable = /P1001|Can't reach database server/i.test(lastOutput);
  if (!unreachable) break; // real migration error - never retry past it
  if (attempt < ATTEMPTS) {
    console.error(
      `migrate-deploy: database unreachable (attempt ${attempt}/${ATTEMPTS}), retrying in ${RETRY_DELAY_MS / 1000}s...`,
    );
    spawnSync("sleep", [String(RETRY_DELAY_MS / 1000)]);
  }
}

const unreachable = /P1001|Can't reach database server/i.test(lastOutput);
if (unreachable && process.env.MIGRATE_ALLOW_UNREACHABLE_SKIP === "1") {
  console.warn(
    "migrate-deploy: WARNING - database unreachable after retries, and " +
      "MIGRATE_ALLOW_UNREACHABLE_SKIP=1 was explicitly set for this deploy. " +
      "SKIPPING the migrate step. Only do this when every migration in " +
      "prisma/migrations is already applied.",
  );
  process.exit(0);
}
process.exit(lastStatus);
