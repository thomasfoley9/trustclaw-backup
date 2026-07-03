import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { getCronRunsInput } from "./getCronRuns.schema";

export const getCronRuns = protectedProcedure
  .input(getCronRunsInput)
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!instance) {
      return { items: [], nextCursor: undefined };
    }

    // instanceId in the where clause is the ownership check - runs are only
    // visible for jobs on the caller's own instance.
    const runs = await db.cronRun.findMany({
      where: { jobId: input.jobId, instanceId: instance.id },
      select: {
        id: true,
        status: true,
        trigger: true,
        startedAt: true,
        finishedAt: true,
        error: true,
        resultText: true,
        inputTokens: true,
        outputTokens: true,
      },
      // id tiebreak: same-timestamp rows would make cursor paging skip or
      // duplicate entries.
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (runs.length > input.limit) {
      const nextItem = runs.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items: runs,
      nextCursor,
    };
  });
