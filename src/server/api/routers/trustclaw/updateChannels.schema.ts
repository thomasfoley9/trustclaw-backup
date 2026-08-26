import { z } from "zod";

export const updateChannelsInput = z.object({
  presenceEnabled: z.boolean().optional(),
  eaSlackEnabled: z.boolean().optional(),
  eaSmsEnabled: z.boolean().optional(),
  // Point the EA at a specific existing Slack channel by exact name (the user
  // must already be a member). Find-only: an explicit name is never auto-created,
  // so a typo errors instead of spawning a stray channel.
  eaSlackChannel: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((s) => s.replace(/^#/, "").toLowerCase())
    .optional(),
});

export type UpdateChannelsInput = z.infer<typeof updateChannelsInput>;
