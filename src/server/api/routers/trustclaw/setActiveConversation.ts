import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const setActiveConversation = protectedProcedure
  .input(z.object({ id: z.string() }))
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

    await db.composioClawInstance.update({
      where: { id: instance.id },
      data: { activeConversationId: conversation.id },
    });

    return { id: conversation.id };
  });
