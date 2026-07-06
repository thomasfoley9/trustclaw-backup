import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { runSingleCronJob } from "~/server/cron/run-single-job";
import {
  enqueueCronJob,
  isWorkerQueueEnabled,
} from "~/server/clients/job-queue";
import { executeJobInput } from "./route.schema";

// Constant-time compare so the bearer check can't leak CRON_SECRET via timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Pro + Fluid Compute ceiling - the runner's 720s wall clock needs headroom.
export const maxDuration = 800;

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
    if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
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

  const { jobId, invocationId, trigger, nowOverride } = parsed.data;

  // Validate the fencing token before accepting - a stale dispatch whose lock
  // was reclaimed by a newer invocation must not run.
  const job = await db.cronJob.findUnique({
    where: { id: jobId },
    select: { lockedBy: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.lockedBy !== invocationId) {
    return NextResponse.json(
      { error: "Fencing token mismatch" },
      { status: 403 },
    );
  }

  if (isWorkerQueueEnabled()) {
    // Hand off to the standalone worker (no Vercel duration ceiling). The
    // invocationId+jobId pair is the idempotency key, so a retried dispatch
    // dedupes to a single run.
    await enqueueCronJob(`cron:${invocationId}:${jobId}`, {
      jobId,
      invocationId,
      trigger,
      ...(nowOverride ? { nowOverride } : {}),
    });
  } else {
    after(
      runSingleCronJob({
        jobId,
        invocationId,
        trigger,
        nowOverride,
      }),
    );
  }

  return NextResponse.json({ status: "accepted", jobId }, { status: 202 });
}
