import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { getComposioForUser } from "~/server/clients/composio";
import { disconnectInput } from "./disconnect.schema";

// Deletes every Composio connected account this user has for the toolkit.
// Deletion revokes the stored OAuth grant on Composio's side, so the agent
// loses access immediately; the user can reconnect from the same card.
export const disconnect = protectedProcedure
  .input(disconnectInput)
  .mutation(async ({ ctx, input }) => {
    const { client, composioUserId } = await getComposioForUser(
      ctx.session.user.id,
    );

    let accounts;
    try {
      accounts = await client.connectedAccounts.list({
        userIds: [composioUserId],
        toolkitSlugs: [input.toolkit],
      });
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to look up your ${input.toolkit} connection`,
      });
    }

    if (accounts.items.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No ${input.toolkit} connection found for your account`,
      });
    }

    try {
      for (const account of accounts.items) {
        await client.connectedAccounts.delete(account.id);
      }
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to disconnect ${input.toolkit}`,
      });
    }

    return { ok: true as const, removed: accounts.items.length };
  });
