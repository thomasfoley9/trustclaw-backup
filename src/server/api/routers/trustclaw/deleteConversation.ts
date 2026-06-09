import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const deleteConversation = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true, activeConversationId: true },
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

    // Cascade-deletes the conversation's messages.
    await db.conversation.delete({ where: { id: conversation.id } });

    // If the deleted session was active, fall back to the most recent
    // remaining one (creating a fresh one if none remain), so there's always
    // an active session.
    let activeConversationId = instance.activeConversationId;
    if (activeConversationId === conversation.id) {
      const next = await db.conversation.findFirst({
        where: { instanceId: instance.id },
        select: { id: true },
        orderBy: { lastMessageAt: "desc" },
      });
      activeConversationId =
        next?.id ??
        (
          await db.conversation.create({
            data: { instanceId: instance.id, title: "New chat" },
            select: { id: true },
          })
        ).id;
      await db.composioClawInstance.update({
        where: { id: instance.id },
        data: { activeConversationId },
      });
    }

    return { id: conversation.id, activeConversationId };
  });
