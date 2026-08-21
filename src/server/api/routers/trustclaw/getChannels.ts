import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { isTwilioConfigured } from "~/server/clients/twilio";
import { EA_CONFIG } from "~/server/ea/config";

export const getChannels = protectedProcedure.query(async ({ ctx }) => {
  const instance = await db.composioClawInstance.findUnique({
    where: { userId: ctx.session.user.id },
    select: {
      presenceEnabled: true,
      eaSlackEnabled: true,
      eaSlackChannelId: true,
      eaSmsEnabled: true,
      eaPhoneNumber: true,
      eaPhoneVerifiedAt: true,
      telegramChatId: true,
    },
  });
  if (!instance) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No Claw by Composio instance found. Create one first.",
    });
  }

  return {
    presenceEnabled: instance.presenceEnabled,
    slack: {
      enabled: instance.eaSlackEnabled,
      channelId: instance.eaSlackChannelId,
    },
    sms: {
      enabled: instance.eaSmsEnabled,
      phoneNumber: instance.eaPhoneNumber,
      verified: instance.eaPhoneVerifiedAt !== null,
      // Dark launch: the door is built; it lights up when Twilio env exists.
      configured: isTwilioConfigured(),
    },
    telegram: { linked: instance.telegramChatId !== null },
    guardrails: {
      quietHours: "9:00pm to 6:30am PT",
      maxDailyPings: EA_CONFIG.maxStandalonePingsPerDay,
      chaseWindowHrs: EA_CONFIG.chaseAfterHrsDefault,
      briefTime: "7:00am PT",
    },
  };
});
