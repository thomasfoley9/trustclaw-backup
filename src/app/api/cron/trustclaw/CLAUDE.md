# TrustClaw Cron System

## Overview

One scheduled job = one agent run = one `CronRun` history row. Two schedulers coexist race-safely over the same DB locks:

1. **Sweeper (always on):** Vercel Cron hits `GET /api/cron/trustclaw` (configured in `vercel.json`). It claims due jobs atomically and dispatches one `POST /api/cron/trustclaw/execute` invocation **per job**.
2. **QStash push (env-gated):** when `QSTASH_TOKEN` is set, each run schedules the job's next fire as a delayed one-shot QStash message targeting `POST /api/cron/qstash`. Exact-minute delivery even when the Vercel sweeper is infrequent (Hobby = daily). Without the env vars everything no-ops and the sweeper is the only scheduler.

## Architecture

```
Vercel Cron sweeper                    QStash one-shot (env-gated)
    |                                       |
    v                                       v
GET /api/cron/trustclaw               POST /api/cron/qstash
    |                                       |
    |  1. Atomic UPDATE..RETURNING          |  1. Verify Upstash signature
    |     claims due + stale-locked jobs    |  2. Atomic claim (same lock
    |  2. Advances nextRunAt for disabled   |     the sweeper uses; loser
    |     past-due jobs                     |     acks 200 and skips)
    |  3. Re-arms QStash orphans            |  3. after(runSingleCronJob)
    |     (chain-heal backstop)             |
    |  4. One fetch per claimed job,        |
    |     jittered (i*400ms, cap 15s)       |
    v                                       |
POST /execute (one per job)                 |
    |  1. Validates fencing token           |
    |     (lockedBy === invocationId)       |
    |  2. Routes to worker queue if         |
    |     WORKER_QUEUE_ENABLED, else        |
    |     after(runSingleCronJob)           |
    |  3. ACKs 202 immediately              |
    v                                       v
        runSingleCronJob()  (src/server/cron/run-single-job.ts)
    |  1. Creates CronRun row (status "running")
    |  2. Runs agent with 240s wall-clock abort
    |  3. finalizeSuccess: run row -> succeeded (+result snippet, tokens),
    |     fenced lock release, nextRunAt recomputed, QStash next fire armed
    |  4. finalizeFailure: run row -> failed, consecutiveFailures++,
    |     AUTO-PAUSE at 3 straight failures (enabled=false + Telegram notice)
    |  5. Telegram delivery of the result (if linked)
```

Manual runs: `runCronJobNow` (tRPC) claims the same lock with a fresh invocationId and POSTs to `/execute` with `trigger: "manual"`. Paused jobs stay runnable manually, so a fix can be verified before re-enabling.

## Locking & Concurrency

Jobs use DB-level locking via atomic `UPDATE ... WHERE` to prevent duplicates:

- **Claim**: Sets `lockedAt`, `lockedBy` (UUID), clears `nextRunAt`
- **Release**: On success/error, clears lock and recomputes `nextRunAt`
- **Fencing**: Release queries include `WHERE lockedBy = invocationId` so a stale-reclaimed lock can't be overwritten by the original holder
- **Stale recovery**: Jobs locked for >10 minutes are reclaimed (covers crashed functions)

| Scenario | How it's handled |
|---|---|
| Sweeper and QStash both fire | Atomic claim - only one wins, the other acks and skips |
| Two concurrent sweeper invocations | Atomic UPDATE - only one wins per row |
| Job takes a while, next tick fires | `nextRunAt=NULL` on claim prevents re-pick |
| Function crashes mid-run | Stale lock reclaimed after 10 minutes |
| Run exceeds 240s | AbortController kills it; failure path finalizes |
| Job fails 3x in a row | Auto-paused (enabled=false), user notified via Telegram |
| Missed tick / lost QStash delivery | Sweeper claims past-due jobs; chain-heal re-arms future ones |
| Job disabled while running | Toggle clears lock; running agent's fenced release is a no-op |
| Job deleted while running | Row gone; release updates 0 rows; CronRun rows cascade away |
| Poisoned job | Isolated: one execute invocation per job, no batchmates |

## Key Files

| File | Purpose |
|---|---|
| `route.ts` | Sweeper - claims due jobs, per-job dispatch, QStash chain-heal |
| `execute/route.ts` | Per-job executor - fencing check, worker-queue routing, `after()` |
| `execute/route.schema.ts` | Zod schemas for execute body + worker payload |
| `../qstash/route.ts` | QStash delivery endpoint - signature verify, atomic claim |
| `~/server/cron/run-single-job.ts` | The runner: CronRun rows, abort, finalize, auto-pause |
| `~/server/clients/qstash.ts` | `scheduleNextFire` / `cancelScheduledFire` / signature verify |
| `~/server/api/routers/trustclaw/runCronJobNow.ts` | Manual "Run now" (tRPC) |
| `~/server/api/routers/trustclaw/getCronRuns.ts` | Run history for the settings UI |
| `~/server/api/routers/trustclaw/toggleCronJob.ts` | Toggle; resets failure streak on enable; syncs QStash |
| `~/server/api/routers/trustclaw/deleteCronJob.ts` | Delete; cancels pending QStash fire first |
| `~/server/api/routers/trustclaw/agent/tools/cron-utils.ts` | `computeNextRunAt()`, `validateCronExpression()` |

## Database Schema

```
CronJob: id, instanceId, expression, prompt, timezone, enabled,
         lastRunAt, nextRunAt, lockedAt, lockedBy, lastError,
         consecutiveFailures, qstashMessageId
CronRun: id, jobId, instanceId, status (running|succeeded|failed),
         trigger (schedule|manual), startedAt, finishedAt, error,
         resultText (first 500 chars), inputTokens, outputTokens
```

## Env

| Var | Effect |
|---|---|
| `CRON_SECRET` | Bearer auth for sweeper + execute (Vercel injects it on cron ticks) |
| `QSTASH_TOKEN` | Enables push scheduling (publish/cancel one-shots) |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Verify inbound QStash deliveries |
| `WORKER_QUEUE_ENABLED` + `REDIS_URL` | Route runs to the standalone BullMQ worker instead of `after()` |

## Local Testing

Requires `psql` for DB commands and the dev server running (`pnpm dev`).

```bash
# List all jobs and their status (RUNNING/DUE/SCHEDULED/ERRORED/IDLE)
./scripts/test-cron.sh list

# Make a job due by setting nextRunAt to the past
./scripts/test-cron.sh make-due <job-id>
./scripts/test-cron.sh make-due <job-id> "5 minutes ago"

# Trigger the cron (with dev server running)
./scripts/test-cron.sh trigger

# Trigger with a fake time (dev only - ignored in production)
./scripts/test-cron.sh trigger --now "2025-06-15T09:00:00Z"

# Check a job's full status (lock state, error, timestamps)
./scripts/test-cron.sh status <job-id>

# Force-unlock a stuck job
./scripts/test-cron.sh unlock <job-id>
```

The Settings > Scheduled Tasks card also exposes Run now and per-job run history, which is usually the fastest way to test a job end to end.

**Date override (`--now`):** The cron route accepts a `?now=` query param in development mode. This overrides `new Date()` for the claim query and flows through to the execute endpoint for `lastRunAt`. Useful for testing time-specific schedules without waiting or manipulating the DB.
