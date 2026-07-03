import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "~/generated/prisma/client";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { computeNextRunSafe } from "~/server/api/routers/trustclaw/agent/tools/cron-utils";
import { isQstashEnabled, scheduleNextFire } from "~/server/clients/qstash";

// Constant-time compare so the bearer check can't leak CRON_SECRET via timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const claimedJobRow = z.object({
  id: z.string(),
  instanceId: z.string(),
});

const staleJobRow = z.object({
  id: z.string(),
  expression: z.string(),
  timezone: z.string(),
});

function parseNowOverride(request: Request): Date {
  if (env.NODE_ENV !== "development") return new Date();

  const url = new URL(request.url);
  const nowParam = url.searchParams.get("now");
  if (!nowParam) return new Date();

  const parsed = new Date(nowParam);
  if (isNaN(parsed.getTime())) return new Date();

  return parsed;
}

export async function GET(request: Request) {
  // Vercel auto-injects CRON_SECRET when crons are declared in vercel.json and
  // sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests.
  // In dev we allow unauthenticated calls so the local trigger script works.
  if (env.NODE_ENV !== "development") {
    // Fail closed before the bearer comparison: if CRON_SECRET is missing
    // (e.g. env validation was bypassed and the var was never set), the
    // expected header would interpolate to `Bearer undefined` and accept
    // anyone sending that literal string. Reject the request outright.
    if (typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length === 0) {
      return new Response("Server misconfigured: CRON_SECRET missing", {
        status: 503,
      });
    }
    const auth = request.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const now = parseNowOverride(request);
  const invocationId = crypto.randomUUID();
  const lockTimeout = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  const claimedJobs = z.array(claimedJobRow).parse(
    await db.$queryRaw`
      UPDATE composio_claw_cron_job cj
      SET
        "lockedAt" = ${now},
        "lockedBy" = ${invocationId},
        "nextRunAt" = NULL
      FROM composio_claw_instance ci
      WHERE cj."instanceId" = ci.id
        AND cj.enabled = true
        AND (
          (cj."nextRunAt" <= ${now} AND cj."lockedAt" IS NULL)
          OR (cj."lockedAt" IS NOT NULL AND cj."lockedAt" < ${lockTimeout})
        )
      RETURNING cj.id, cj."instanceId"
    `,
  );

  // Advance nextRunAt for past-due jobs that can't be claimed (disabled)
  const staleJobs = z.array(staleJobRow).parse(
    await db.$queryRaw`
      SELECT id, expression, timezone
      FROM composio_claw_cron_job
      WHERE "nextRunAt" <= ${now}
        AND "lockedAt" IS NULL
        AND enabled = false
    `,
  );

  if (staleJobs.length > 0) {
    const values = staleJobs
      .map((job) => {
        const nextRunAt = computeNextRunSafe(job.expression, job.timezone);
        return nextRunAt ? Prisma.sql`(${job.id}, ${nextRunAt}::timestamptz)` : null;
      })
      .filter((v): v is Prisma.Sql => v !== null);

    if (values.length > 0) {
      await db.$queryRaw`
        UPDATE composio_claw_cron_job AS cj
        SET "nextRunAt" = v."nextRunAt"::timestamptz
        FROM (VALUES ${Prisma.join(values)}) AS v(id, "nextRunAt")
        WHERE cj.id = v.id
      `;
    }
  }

  // QStash chain-heal: jobs that are scheduled for the future but have no
  // pending one-shot (a delivery was lost, or QStash was enabled after the
  // job existed) get their next fire re-armed. The claim query above already
  // covers PAST-due jobs, so together the sweeper fully self-heals the push
  // path. Bounded per tick; anything beyond heals on the next tick.
  if (isQstashEnabled()) {
    const orphans = await db.cronJob.findMany({
      where: {
        enabled: true,
        lockedAt: null,
        qstashMessageId: null,
        nextRunAt: { gt: now },
      },
      select: { id: true, nextRunAt: true },
      take: 100,
    });
    for (const orphan of orphans) {
      await scheduleNextFire(orphan.id, orphan.nextRunAt);
    }
  }

  if (claimedJobs.length === 0) {
    return NextResponse.json({ dispatched: 0, results: [], now: now.toISOString() });
  }

  const executeUrl = `${env.NEXT_PUBLIC_APP_URL}/api/cron/trustclaw/execute`;

  // One execute invocation per job (isolation: a poisoned job can't take
  // down batchmates), staggered so a same-minute herd doesn't slam the
  // providers in one burst. The dispatch itself is fast - execute ACKs 202
  // and runs the agent in the background.
  const results = await Promise.allSettled(
    claimedJobs.map(
      (job, i) =>
        new Promise<Response>((resolve, reject) => {
          setTimeout(
            () => {
              fetch(executeUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  // Forward CRON_SECRET so /execute can authenticate the call.
                  Authorization: `Bearer ${env.CRON_SECRET}`,
                },
                body: JSON.stringify({
                  jobId: job.id,
                  invocationId,
                  nowOverride: now.toISOString(),
                }),
              }).then(resolve, reject);
            },
            Math.min(i * 400, 15_000),
          );
        }),
    ),
  );

  const dispatched = results.map((result, i) => ({
    jobId: claimedJobs[i]!.id,
    status:
      result.status === "fulfilled" && result.value.ok
        ? "dispatched"
        : "dispatch_failed",
  }));

  return NextResponse.json({
    dispatched: claimedJobs.length,
    results: dispatched,
    now: now.toISOString(),
  });
}
