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
    // that throw during onboarding - return placeholders so the integrations
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
          })),
        };
      }
      throw error;
    }

    // STATUS ONLY - this query is polled every 5s by the onboarding step, so
    // it must be side-effect free. Auth links are minted on demand by the
    // toolkits.getAuthLink mutation when the user clicks Connect (the old
    // per-poll session.authorize() spammed a new INITIATED connection request
    // into the user's Composio project on every tick).
    const { client, composioUserId } = composio;
    const session = await client.create(composioUserId, {});
    const toolkitsInfo = await session.toolkits({
      toolkits: ONBOARDING_TOOLKITS.map((t) => t.slug),
    });

    const integrations = ONBOARDING_TOOLKITS.map((toolkit) => {
      const info = toolkitsInfo.items.find((i) => i.slug === toolkit.slug);
      return {
        toolkit: toolkit.slug,
        name: toolkit.name,
        logo: toolkit.logo,
        connected: !!info?.connection?.isActive,
      };
    });

    return { keyMissing: false, integrations };
  },
);
