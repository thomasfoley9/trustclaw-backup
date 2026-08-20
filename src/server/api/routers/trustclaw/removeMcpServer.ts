import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { removeMcpServerInput } from "./removeMcpServer.schema";

export const removeMcpServer = protectedProcedure
  .input(removeMcpServerInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent instance not found.",
      });
    }
    // Scoped to the instance so a user can only delete their own servers.
    await db.mcpServer.deleteMany({
      where: { id: input.id, instanceId: instance.id },
    });
    return { ok: true as const };
  });
