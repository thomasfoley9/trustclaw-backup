import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { getComposioForUser } from "~/server/clients/composio";

const ONBOARDING_TOOLKITS = [
  {
    slug: "gmail",
    name: "Gmail",
    logo: "https://logos.composio.dev/api/gmail",
  },
  {
    slug: "github",
    name: "GitHub",
    logo: "https://logos.composio.dev/api/github",
  },
  {
    slug: "slack",
    name: "Slack",
    logo: "https://logos.composio.dev/api/slack",
  },
] as const;

export const getIntegrationAuthLinks = protectedProcedure.query(
  async ({ ctx }) => {
    // Every brand-new user is keyless until they add a Composio key. Don't let
    // that throw during onboarding — return placeholders so the integrations
    // step can render a friendly "add your key later" state and proceed.
    let composio;
    try {
      composio = await getComposioForUser(ctx.session.user.id);
    } catch (error) {
      if (
        error instanceof TRPCError &&
        error.code === "PRECONDITION_FAILED"
      ) {
        return {
          keyMissing: true,
          integrations: ONBOARDING_TOOLKITS.map((t) => ({
            toolkit: t.slug,
            name: t.name,
            logo: t.logo,
            connected: false,
            redirectUrl: null as string | null,
          })),
        };
      }
      throw error;
    }

    const { client, composioUserId } = composio;
    const session = await client.create(composioUserId, {});
    const toolkitsInfo = await session.toolkits({
      toolkits: ONBOARDING_TOOLKITS.map((t) => t.slug),
    });

    const integrations = await Promise.all(
      ONBOARDING_TOOLKITS.map(async (toolkit) => {
        const info = toolkitsInfo.items.find((i) => i.slug === toolkit.slug);
        const connected = !!info?.connection?.isActive;

        let redirectUrl: string | null = null;
        if (!connected) {
          try {
            const connectionRequest = await session.authorize(toolkit.slug);
            redirectUrl = connectionRequest.redirectUrl ?? null;
          } catch {
            // OAuth URL generation failed -- user can skip
          }
        }

        return {
          toolkit: toolkit.slug,
          name: toolkit.name,
          logo: toolkit.logo,
          connected,
          redirectUrl,
        };
      }),
    );

    return { keyMissing: false, integrations };
  },
);
