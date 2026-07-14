import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { restartOnboardingInput } from "./restartOnboarding.schema";

// Non-destructive "Re-run setup": flags the wizard to render again on the
// dashboard. Prior answers in onboardingState are preserved; only the current
// step rewinds to the start. Nothing on the instance is touched.
export const restartOnboarding = protectedProcedure
  .input(restartOnboardingInput)
  .mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No instance to reconfigure - complete setup first.",
      });
    }

    await db.onboardingState.upsert({
      where: { userId },
      create: { userId, currentStep: "name", redoRequested: true },
      update: { currentStep: "name", redoRequested: true },
    });

    return { success: true };
  });
