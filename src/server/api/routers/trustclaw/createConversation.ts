import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const createConversation = protectedProcedure.mutation(
  async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    // Atomic: the conversation and the active-pointer update commit together,
    // so a failed update can't orphan the conversation.
    return db.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: { instanceId: instance.id, title: "New chat" },
        select: { id: true, title: true, lastMessageAt: true },
      });
      await tx.composioClawInstance.update({
        where: { id: instance.id },
        data: { activeConversationId: conversation.id },
      });
      return conversation;
    });
  },
);
