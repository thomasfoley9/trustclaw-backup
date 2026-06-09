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

    const conversation = await db.conversation.create({
      data: { instanceId: instance.id, title: "New chat" },
      select: { id: true, title: true, lastMessageAt: true },
    });

    await db.composioClawInstance.update({
      where: { id: instance.id },
      data: { activeConversationId: conversation.id },
    });

    return conversation;
  },
);
