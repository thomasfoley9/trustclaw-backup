import { protectedProcedure } from "~/server/api/trpc";
import { getComposioForUser } from "~/server/clients/composio";
import { checkConnectionStatusInput } from "./checkConnectionStatus.schema";

export const checkConnectionStatus = protectedProcedure
  .input(checkConnectionStatusInput)
  .query(async ({ ctx, input }) => {
    const { client, composioUserId } = await getComposioForUser(
      ctx.session.user.id,
    );
    const session = await client.create(composioUserId, {});

    const toolkitsInfo = await session.toolkits({
      toolkits: input.toolkits,
    });

    const statuses = input.toolkits.map((toolkit) => {
      const info = toolkitsInfo.items.find((i) => i.slug === toolkit);
      return {
        toolkit,
        connected: !!info?.connection?.isActive,
      };
    });

    return { statuses };
  });
