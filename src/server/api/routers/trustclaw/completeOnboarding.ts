import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { completeOnboardingInput } from "./completeOnboarding.schema";

// Marks the wizard finished by clearing the re-run flag. Safe to call on a
// fresh (non-redo) run too: updateMany is a no-op when no state row exists.
export const completeOnboarding = protectedProcedure
  .input(completeOnboardingInput)
  .mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    await db.onboardingState.updateMany({
      where: { userId },
      data: { redoRequested: false },
    });

    return { success: true };
  });
