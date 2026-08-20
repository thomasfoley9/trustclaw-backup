import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import {
  scheduleNextFire,
  cancelScheduledFire,
} from "~/server/clients/qstash";
import { toggleCronJobInput } from "./toggleCronJob.schema";
import { computeNextRunAt } from "./agent/tools/cron-utils";

export const toggleCronJob = protectedProcedure
  .input(toggleCronJobInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const updated = await db.$transaction(async (tx) => {
      const instance = await tx.composioClawInstance.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!instance) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claw by Composio instance not found",
        });
      }

      const job = await tx.cronJob.findFirst({
        where: { id: input.jobId, instanceId: instance.id },
      });

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cron job not found",
        });
      }

      const nextRunAt = input.enabled
        ? computeNextRunAt(job.expression, job.timezone)
        : null;

      const updated = await tx.cronJob.update({
        where: { id: input.jobId },
        data: {
          enabled: input.enabled,
          nextRunAt,
          // Re-enabling is a fresh start for the failure streak.
          ...(input.enabled
            ? { consecutiveFailures: 0, lastError: null }
            : { lockedAt: null, lockedBy: null }),
        },
        select: {
          id: true,
          enabled: true,
          nextRunAt: true,
        },
      });

      return updated;
    });

    // Sync the QStash one-shot AFTER the transaction commits (external HTTP
    // has no place inside a DB transaction). No-ops when QStash is off.
    if (updated.enabled) {
      await scheduleNextFire(updated.id, updated.nextRunAt);
    } else {
      await cancelScheduledFire(updated.id);
    }

    return updated;
  });
