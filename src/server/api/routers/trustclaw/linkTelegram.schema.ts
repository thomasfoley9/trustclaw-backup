import { z } from "zod";

export const linkTelegramOutput = z.object({
  token: z.string(),
  botUsername: z.string(),
  expiresAt: z.date(),
});

export type LinkTelegramOutput = z.infer<typeof linkTelegramOutput>;
