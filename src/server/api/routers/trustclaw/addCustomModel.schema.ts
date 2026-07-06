import { z } from "zod";
import { customModelIdSchema } from "./createInstance.schema";

export const addCustomModelInput = z.object({
  modelId: customModelIdSchema,
  label: z.string().trim().max(60).optional(),
  // Optional BYO provider API key. Stored encrypted; when absent the model
  // routes through the gateway instead of a direct provider call.
  providerApiKey: z.string().trim().min(8).max(512).optional(),
});

export type AddCustomModelInput = z.infer<typeof addCustomModelInput>;
