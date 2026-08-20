import { z } from "zod";
import { selectableModelSchema } from "./createInstance.schema";
import { memoryBucketSchema } from "./memory-buckets";

export const ianaTimezone = z
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
  anthropicModel: selectableModelSchema.optional(),
  // Agent A (voice/conversation front) model. null clears the override -> falls
  // back to a sensible default per surface.
  agentAModel: selectableModelSchema.nullable().optional(),
  timezone: ianaTimezone.optional(),
  activeMemoryBucket: memoryBucketSchema.optional(),
  incognitoMode: z.boolean().optional(),
  activePersonalityId: z.string().nullable().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;
