import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { isTelegramConfigured } from "~/server/clients/telegram";

export const getInstance = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const [instance, onboardingState, user] = await db.$transaction([
    db.composioClawInstance.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        anthropicModel: true,
        agentAModel: true,
        activeMemoryBucket: true,
        incognitoMode: true,
        activeConversationId: true,
        telegramChatId: true,
        // telegramLinkToken/ExpiresAt are intentionally NOT selected here - the
        // live link token is surfaced only from the linkTelegram mutation
        // result, so this broadly-consumed query never ships it to the client.
        soulPrompt: true,
        identityPrompt: true,
        userPrompt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.onboardingState.findUnique({
      where: { userId },
      select: {
        currentStep: true,
        name: true,
        writingStyle: true,
        funWritingStyle: true,
        personality: true,
        emoji: true,
        lore: true,
        anthropicModel: true,
      },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    }),
  ]);

  return {
    instance: instance ?? null,
    onboardingState: onboardingState ?? null,
    timezone: user?.timezone ?? "UTC",
    telegramConfigured: isTelegramConfigured(),
  };
});
