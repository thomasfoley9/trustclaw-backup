import { z } from "zod";

export const removeMcpServerInput = z.object({ id: z.string() });

export type RemoveMcpServerInput = z.infer<typeof removeMcpServerInput>;
