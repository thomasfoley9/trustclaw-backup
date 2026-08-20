import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { encryptSecret } from "~/server/clients/crypto";
import { checkSmallestKey } from "~/server/clients/smallest";
import { setVoiceApiKeyInput } from "./setVoiceApiKey.schema";

export const setVoiceApiKey = protectedProcedure
  .input(setVoiceApiKeyInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent instance not found.",
      });
    }

    const result = await checkSmallestKey(input.apiKey);
    if (result === "unauthorized") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Smallest.ai rejected this API key. Double-check and try again.",
      });
    }
    if (result !== "ok") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Couldn't reach Smallest.ai to validate the key. Try again.",
      });
    }

    await db.composioClawInstance.update({
      where: { userId },
      data: { voiceApiKey: encryptSecret(input.apiKey) },
    });

    return { ok: true as const };
  });
