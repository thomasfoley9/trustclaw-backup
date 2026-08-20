import { TRPCError } from "@trpc/server";
import { env } from "~/env";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { runCronJobNowInput } from "./runCronJobNow.schema";

// Must exceed the runner's wall-clock budget (RUN_WALL_CLOCK_MS = 720s in
// run-single-job.ts) plus finalize headroom, so a still-running job is not
// reclaimed and re-run concurrently.
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export const runCronJobNow = protectedProcedure
  .input(runCronJobNowInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Claw by Composio instance not found",
      });
    }

    const job = await db.cronJob.findFirst({
      where: { id: input.jobId, instanceId: instance.id },
      select: { id: true },
    });
    if (!job) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Cron job not found",
      });
    }

    // Atomic claim with the same lock the schedulers use, so a manual run can
    // never overlap a scheduled one. Paused jobs stay runnable - manual runs
    // are how you verify a fix before flipping a job back on.
    const now = new Date();
    const invocationId = crypto.randomUUID();
    const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    const claimed = await db.cronJob.updateMany({
      where: {
        id: job.id,
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
      },
      data: { lockedAt: now, lockedBy: invocationId },
    });
    if (claimed.count === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This task is already running. Try again in a moment.",
      });
    }

    // Same dispatch path the scheduler uses: the execute route ACKs fast and
    // runs the agent in the background under its own duration ceiling, so the
    // mutation returns immediately.
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_APP_URL}/api/cron/trustclaw/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            jobId: job.id,
            invocationId,
            trigger: "manual",
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) {
        throw new Error(`execute dispatch returned ${res.status}`);
      }
    } catch (error) {
      // Fenced release so a failed dispatch doesn't leave the job locked for
      // the full stale-lock window.
      await db.cronJob
        .updateMany({
          where: { id: job.id, lockedBy: invocationId },
          data: { lockedAt: null, lockedBy: null },
        })
        .catch(() => undefined);
      console.error(
        `[cron/run-now] dispatch failed for job ${job.id}:`,
        error,
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not start the run. Please try again.",
      });
    }

    return { started: true };
  });
