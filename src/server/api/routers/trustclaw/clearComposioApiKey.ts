import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const clearComposioApiKey = protectedProcedure.mutation(
  async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true, composioApiKey: true, eaSlackEnabled: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent instance not found.",
      });
    }
    // Removing the key changes which Composio connections back the EA (BYO ->
    // shared key or nothing), so the Slack binding captured through the old
    // connection is stale. Same fail-closed reset as setComposioApiKey: clear
    // the trio and let the next Slack enable re-seed through whatever
    // connection is live then. A no-op clear (no key stored) resets nothing.
    const keyChanged = !!instance.composioApiKey;
    await db.composioClawInstance.update({
      where: { userId },
      data: {
        composioApiKey: null,
        ...(keyChanged && {
          eaSlackEnabled: false,
          eaSlackChannelId: null,
          eaSlackCursorTs: null,
          eaSlackOwnerUserId: null,
        }),
      },
    });
    return {
      ok: true as const,
      eaSlackReset: keyChanged && instance.eaSlackEnabled,
    };
  },
);
