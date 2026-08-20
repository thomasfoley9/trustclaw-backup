import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const renameConversation = protectedProcedure
  // trim() before min(1) so a whitespace-only title is rejected rather than
  // saved as an empty string.
  .input(z.object({ id: z.string(), title: z.string().trim().min(1).max(100) }))
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const conversation = await db.conversation.findFirst({
      where: { id: input.id, instanceId: instance.id },
      select: { id: true },
    });
    if (!conversation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    return db.conversation.update({
      where: { id: conversation.id },
      data: { title: input.title },
      select: { id: true, title: true, lastMessageAt: true },
    });
  });
