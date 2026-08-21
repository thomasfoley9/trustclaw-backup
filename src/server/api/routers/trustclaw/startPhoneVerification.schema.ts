import { z } from "zod";

// E.164, the format Twilio speaks: +14155550132
export const startPhoneVerificationInput = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, like +14155550132"),
});

export type StartPhoneVerificationInput = z.infer<
  typeof startPhoneVerificationInput
>;
