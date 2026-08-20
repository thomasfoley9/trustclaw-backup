import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { getComposioForUser } from "~/server/clients/composio";
import { env } from "~/env";
import { getAuthLinkInput } from "./getAuthLink.schema";

export const getAuthLink = protectedProcedure
  .input(getAuthLinkInput)
  .mutation(async ({ ctx, input }) => {
    const { client, composioUserId } = await getComposioForUser(
      ctx.session.user.id,
    );
    const session = await client.create(composioUserId, {});

    try {
      const connectionRequest = await session.authorize(input.toolkit, {
        callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/toolkits`,
      });
      const redirectUrl = connectionRequest.redirectUrl;

      if (!redirectUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate OAuth URL for this toolkit",
        });
      }

      return { redirectUrl };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to authorize ${input.toolkit}`,
      });
    }
  });
