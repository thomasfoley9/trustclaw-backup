import { after, NextResponse } from "next/server";
import { Prisma } from "~/generated/prisma/client";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { runCronJobs } from "~/server/cron/run-cron-jobs";
import {
  enqueueCronJob,
  isWorkerQueueEnabled,
} from "~/server/clients/job-queue";
import { executeJobInput, cronJobRow } from "./route.schema";

async function loadJobsFromDb(jobIds: string[]) {
  const rows = z.array(cronJobRow).parse(
    await db.$queryRaw`
      SELECT
        cj.id,
        cj."instanceId",
        cj.expression,
        cj.prompt,
        cj.timezone,
        cj."lockedBy",
        ci."telegramChatId"
      FROM composio_claw_cron_job cj
      JOIN composio_claw_instance ci ON cj."instanceId" = ci.id
      WHERE cj.id IN (${Prisma.join(jobIds)})
    `,
  );

  return rows;
}

export const maxDuration = 60;

export async function POST(request: Request) {
  // Bearer-auth via CRON_SECRET (auto-injected by Vercel for cron-triggered
  // routes; the dispatcher /api/cron/trustclaw forwards it on internal fetch).
  // Dev mode allows unauthenticated calls so the local trigger script works.
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
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const body: unknown = await request.json();
  const parsed = executeJobInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { jobIds, invocationId, nowOverride } = parsed.data;

  const jobs = await loadJobsFromDb(jobIds);

  if (jobs.length === 0) {
    return NextResponse.json({ error: "No jobs found" }, { status: 404 });
  }

  // Filter to jobs with valid fencing tokens
  const validJobs = jobs.filter((job) => job.lockedBy === invocationId);

  if (validJobs.length === 0) {
    return NextResponse.json(
      { error: "Fencing token mismatch for all jobs" },
      { status: 403 },
    );
  }

  if (isWorkerQueueEnabled()) {
    // Hand off to the standalone worker (no Vercel duration ceiling). The
    // invocationId is the idempotency key, so a retried dispatch dedupes to a
    // single run. The worker re-runs the exact same runCronJobs() logic.
    await enqueueCronJob(`cron:${invocationId}`, {
      jobs: validJobs,
      invocationId,
      ...(nowOverride ? { nowOverride } : {}),
    });
  } else {
    after(runCronJobs(validJobs, invocationId, nowOverride));
  }

  return NextResponse.json(
    { status: "accepted", jobCount: validJobs.length },
    { status: 202 },
  );
}
