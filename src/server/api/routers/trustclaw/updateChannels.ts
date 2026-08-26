import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import {
  ensureEaChannel,
  postToEaChannel,
  repointEaChannel,
} from "~/server/clients/slack";
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
        eaSlackCursorTs: true,
        user: { select: { timezone: true } },
      },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Claw by Composio instance found. Create one first.",
      });
    }

    // Gate on the CURSOR, not just the channel id: ensureEaChannel persists the
    // id before the welcome post runs, so a partial failure (channel created,
    // post failed) must re-run this block on retry or the cursor/owner-id
    // seeding is silently skipped forever. ensureEaChannel is idempotent.
    // An explicit eaSlackChannel always re-runs the block (repoint), even when
    // a channel is already configured.
    const wantsRepoint = !!input.eaSlackChannel;
    if (
      wantsRepoint ||
      (input.eaSlackEnabled === true &&
        (!instance.eaSlackChannelId || !instance.eaSlackCursorTs))
    ) {
      try {
        if (wantsRepoint) {
          await repointEaChannel(instance.id, input.eaSlackChannel!);
        } else {
          await ensureEaChannel(instance.id);
        }
        // Fail closed: only enable Slack presence if we can actually post. The
        // welcome post's own ts becomes the inbound cursor, so no prior
        // conversation in an adopted #ea channel is ever replayed as commands,
        // and being a ledger-verified own post it seeds the owner-id gate.
        const welcome = await postToEaChannel(
          instance.id,
          "Presence Mode is on. I'll post nudges and briefs here, and you can reply with commands like \"done T-14\" or \"snooze T-9 til friday\". Only messages from you are acted on.",
        );
        if (!welcome.ok || !welcome.ts) {
          throw new Error(
            "Couldn't post to your #ea channel. Check the Slack connection in Toolkits, then retry.",
          );
        }
        await db.composioClawInstance.update({
          where: { id: instance.id },
          data: { eaSlackCursorTs: welcome.ts },
        });
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
