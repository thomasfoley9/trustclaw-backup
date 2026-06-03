import { z } from "zod";
import { ALLOWED_ANTHROPIC_MODELS } from "./createInstance.schema";
import { memoryBucketSchema } from "./memory-buckets";

const ianaTimezone = z
  .string()
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid IANA timezone" },
  );

export const updateSettingsInput = z.object({
  anthropicModel: z.enum(ALLOWED_ANTHROPIC_MODELS).optional(),
  timezone: ianaTimezone.optional(),
  activeMemoryBucket: memoryBucketSchema.optional(),
  incognitoMode: z.boolean().optional(),
  activePersonalityId: z.string().nullable().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;
