import { protectedProcedure } from "~/server/api/trpc";
import { getComposioForUser } from "~/server/clients/composio";
import { getToolkitsInput } from "./getToolkits.schema";

export const getToolkits = protectedProcedure
  .input(getToolkitsInput)
  .query(async ({ ctx, input }) => {
    const { client, composioUserId } = await getComposioForUser(
      ctx.session.user.id,
    );
    const session = await client.create(composioUserId, {});

    // 1. Fetch toolkit listing
    const toolkitsResult = await session.toolkits({
      ...(input.search && input.search.length >= 3
        ? { search: input.search }
        : {}),
      ...(input.isConnected !== undefined
        ? { isConnected: input.isConnected }
        : {}),
      limit: input.limit,
      nextCursor: input.cursor,
    });

    if (toolkitsResult.items.length === 0) {
      return { items: [], nextCursor: null };
    }

    // 2. Merge and return
    const items = toolkitsResult.items.map((toolkit) => ({
      slug: toolkit.slug,
      name: toolkit.name,
      logo: toolkit.logo ?? `https://logos.composio.dev/api/${toolkit.slug}`,
      noAuth: toolkit.isNoAuth,
      connected: !!toolkit.connection?.isActive,
    }));

    return {
      items,
      nextCursor: toolkitsResult.nextCursor ?? null,
    };
  });
