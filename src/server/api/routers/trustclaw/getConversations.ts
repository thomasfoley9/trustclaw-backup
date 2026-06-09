import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const getConversations = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { id: true, activeConversationId: true },
  });

  if (!instance) {
    return { conversations: [], activeConversationId: null };
  }

  const conversations = await db.conversation.findMany({
    where: { instanceId: instance.id },
    select: { id: true, title: true, lastMessageAt: true },
    orderBy: { lastMessageAt: "desc" },
  });

  return {
    conversations,
    activeConversationId: instance.activeConversationId,
  };
});
