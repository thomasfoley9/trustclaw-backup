import { z } from "zod";

export const updateChannelsInput = z.object({
  presenceEnabled: z.boolean().optional(),
  eaSlackEnabled: z.boolean().optional(),
  eaSmsEnabled: z.boolean().optional(),
});

export type UpdateChannelsInput = z.infer<typeof updateChannelsInput>;
