import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { cancelScheduledFire } from "~/server/clients/qstash";
import { deleteCronJobInput } from "./deleteCronJob.schema";

export const deleteCronJob = protectedProcedure
  .input(deleteCronJobInput)
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

    // Ownership verified - cancel any pending QStash fire BEFORE the delete
    // removes the stored message id. Best-effort; no-op when QStash is off.
    await cancelScheduledFire(job.id).catch(() => undefined);

    // deleteMany: idempotent if the job vanished between check and delete.
    await db.cronJob.deleteMany({
      where: { id: job.id, instanceId: instance.id },
    });

    return { success: true };
  });
