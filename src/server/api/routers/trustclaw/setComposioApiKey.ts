import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { encryptSecret } from "~/server/clients/crypto";
import { setComposioApiKeyInput } from "./setComposioApiKey.schema";

const COMPOSIO_BASE_URL = "https://backend.composio.dev";

async function validateAgainstComposio(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${COMPOSIO_BASE_URL}/api/v3/toolkits?limit=1`, {
      headers: { "x-api-key": apiKey },
      // Don't let a hung upstream pin the serverless function — bail after 8s.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Couldn't reach Composio to validate the key. Try again.",
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Composio rejected this API key. Double-check and try again.",
    });
  }
  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Composio returned ${res.status} while validating the key.`,
    });
  }
}

export const setComposioApiKey = protectedProcedure
  .input(setComposioApiKeyInput)
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

    await validateAgainstComposio(input.apiKey);

    await db.composioClawInstance.update({
      where: { userId },
      data: { composioApiKey: encryptSecret(input.apiKey) },
    });

    return { ok: true as const };
  });
