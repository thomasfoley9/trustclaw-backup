import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { encryptSecret } from "~/server/clients/crypto";
import { setAnthropicApiKeyInput } from "./setAnthropicApiKey.schema";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

// Validate the key with a free, read-only call (model listing) before storing.
async function validateAgainstAnthropic(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_BASE_URL}/v1/models?limit=1`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      // Don't let a hung upstream pin the serverless function - bail after 8s.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Couldn't reach Anthropic to validate the key. Try again.",
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Anthropic rejected this API key. Double-check and try again.",
    });
  }
  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Anthropic returned ${res.status} while validating the key.`,
    });
  }
}

export const setAnthropicApiKey = protectedProcedure
  .input(setAnthropicApiKeyInput)
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

    await validateAgainstAnthropic(input.apiKey);

    await db.composioClawInstance.update({
      where: { userId },
      data: { anthropicApiKey: encryptSecret(input.apiKey) },
    });

    return { ok: true as const };
  });
