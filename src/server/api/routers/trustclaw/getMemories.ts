import { z } from "zod";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { getMemoriesInput, memoryRow } from "./getMemories.schema";

export const getMemories = protectedProcedure
  .input(getMemoriesInput)
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!instance) {
      return { items: [], nextCursor: undefined };
    }

    const rows = await db.memory.findMany({
      where: { instanceId: instance.id },
      select: { id: true, content: true, category: true, createdAt: true },
      // id tiebreak: createdAt is not unique, and cursor paging over a
      // non-unique sort key can skip or duplicate rows.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (rows.length > input.limit) {
      const nextItem = rows.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items: z.array(memoryRow).parse(rows),
      nextCursor,
    };
  });
