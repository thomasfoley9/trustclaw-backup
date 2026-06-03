import { z } from "zod";

export const deletePersonalityInput = z.object({
  id: z.string(),
});

export type DeletePersonalityInput = z.infer<typeof deletePersonalityInput>;
