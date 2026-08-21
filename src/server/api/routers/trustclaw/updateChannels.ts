import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { ensureEaChannel } from "~/server/clients/slack";
import { seedEaSystemJobs, disableEaSystemJobs } from "~/server/ea/seed";
import { pauselessReenable } from "~/server/ea/sweep";
import { updateChannelsInput } from "./updateChannels.schema";

// The Channels page's single mutation: master kill switch + per-channel
// toggles. Semantics that matter:
//   - Presence ON seeds the EA system jobs and restarts ladder clocks so a
//     re-enable never backfires a burst (missed items fold into the brief).
//   - Presence OFF disables the system jobs; the sweep skips the instance
//     entirely, so outreach stops on the next tick everywhere at once.
//   - Enabling Slack finds-or-creates the private #ea channel and pins its id.
export const updateChannels = protectedProcedure
  .input(updateChannelsInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        presenceEnabled: true,
        eaSlackChannelId: true,
        user: { select: { timezone: true } },
      },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Claw by Composio instance found. Create one first.",
      });
    }

    if (input.eaSlackEnabled === true && !instance.eaSlackChannelId) {
      try {
        await ensureEaChannel(instance.id);
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't set up the #ea Slack channel. Check your Slack connection in Toolkits.",
        });
      }
    }

    const updated = await db.composioClawInstance.update({
      where: { id: instance.id },
      data: {
        ...(input.presenceEnabled !== undefined && {
          presenceEnabled: input.presenceEnabled,
        }),
        ...(input.eaSlackEnabled !== undefined && {
          eaSlackEnabled: input.eaSlackEnabled,
        }),
        ...(input.eaSmsEnabled !== undefined && {
          eaSmsEnabled: input.eaSmsEnabled,
        }),
      },
      select: { presenceEnabled: true },
    });

    if (input.presenceEnabled === true && !instance.presenceEnabled) {
      // The brief follows the user's timezone; the "UTC" default means they
      // never set one, so the PRD's 7:00am PT applies.
      const tz =
        instance.user.timezone && instance.user.timezone !== "UTC"
          ? instance.user.timezone
          : undefined;
      await seedEaSystemJobs(instance.id, tz);
      await pauselessReenable(instance.id);
    }
    if (input.presenceEnabled === false && instance.presenceEnabled) {
      await disableEaSystemJobs(instance.id);
    }

    return { presenceEnabled: updated.presenceEnabled };
  });
