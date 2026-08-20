import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { isTelegramConfigured } from "~/server/clients/telegram";

export const getStatus = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const [instance, onboardingState] = await db.$transaction([
    db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    }),
    db.onboardingState.findUnique({
      where: { userId },
      select: { redoRequested: true },
    }),
  ]);

  return {
    hasInstance: !!instance,
    hasOnboardingState: !!onboardingState,
    // The user asked to re-run setup (Settings -> "Re-run setup"): show the
    // wizard again even though the instance exists. Nothing is deleted.
    redoOnboarding: !!instance && !!onboardingState?.redoRequested,
    telegramConfigured: isTelegramConfigured(),
  };
});
