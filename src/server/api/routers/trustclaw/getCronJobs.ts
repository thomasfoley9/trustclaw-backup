import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { getCronJobsInput } from "./getCronJobs.schema";

export const getCronJobs = protectedProcedure
  .input(getCronJobsInput)
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!instance) {
      return { items: [], nextCursor: undefined };
    }

    const jobs = await db.cronJob.findMany({
      where: { instanceId: instance.id },
      select: {
        id: true,
        expression: true,
        prompt: true,
        timezone: true,
        enabled: true,
        lastRunAt: true,
        nextRunAt: true,
        lockedAt: true,
        lastError: true,
        consecutiveFailures: true,
      },
      // id tiebreak: nextRunAt is null for every disabled job, and cursor
      // paging over a non-unique sort key can skip or duplicate rows.
      orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (jobs.length > input.limit) {
      const nextItem = jobs.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items: jobs,
      nextCursor,
    };
  });
