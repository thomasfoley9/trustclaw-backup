import { after, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { verifyQstashSignature } from "~/server/clients/qstash";
import { runSingleCronJob } from "~/server/cron/run-single-job";

// QStash delivery endpoint: one message = one job fire. Signature-verified,
// then the job is claimed atomically (the same lock the sweeper uses, so the
// two schedulers can coexist without double-running anything). Acks 200
// immediately and runs the agent in after() - QStash expects a fast response
// and retries non-2xx, which is exactly what we want for a failed CLAIM but
// not for a failed RUN (run failures are the job's own retry/auto-pause
// domain, so those still ack 200).
// Pro + Fluid Compute ceiling - the runner's 720s wall clock needs headroom.
export const maxDuration = 800;

const deliveryBody = z.object({ jobId: z.string() });

// Must exceed the runner's wall-clock budget (RUN_WALL_CLOCK_MS = 720s in
// run-single-job.ts) plus finalize headroom, or a job still legitimately
// running gets reclaimed and re-run concurrently.
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  if (!env.QSTASH_CURRENT_SIGNING_KEY && !env.QSTASH_NEXT_SIGNING_KEY) {
    return new Response("QStash not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") ?? "";
  const verified = await verifyQstashSignature(
    signature,
    rawBody,
    `${env.NEXT_PUBLIC_APP_URL}/api/cron/qstash`,
  );
  if (!verified) {
    return new Response("Invalid signature", { status: 401 });
  }

  const parsed = deliveryBody.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody) as unknown;
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) {
    // Malformed payload will never succeed - ack it into the DLQ's past.
    return NextResponse.json({ skipped: "bad body" }, { status: 200 });
  }

  const { jobId } = parsed.data;
  const now = new Date();
  const invocationId = crypto.randomUUID();
  const lockTimeout = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  // Atomic claim - identical semantics to the sweeper's. If the sweeper (or a
  // duplicate delivery) got here first, count === 0 and we ack without
  // running. Also refuses disabled jobs (paused between schedule and fire).
  const claimed = await db.cronJob.updateMany({
    where: {
      id: jobId,
      enabled: true,
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockTimeout } }],
    },
    data: {
      lockedAt: now,
      lockedBy: invocationId,
      nextRunAt: null,
      qstashMessageId: null,
    },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ skipped: "not claimable" }, { status: 200 });
  }

  after(
    runSingleCronJob({
      jobId,
      invocationId,
      trigger: "schedule",
    }),
  );

  return NextResponse.json({ status: "accepted", jobId }, { status: 200 });
}
