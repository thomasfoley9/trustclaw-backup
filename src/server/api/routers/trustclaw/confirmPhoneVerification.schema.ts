import { z } from "zod";

export const confirmPhoneVerificationInput = z.object({
  code: z.string().regex(/^\d{6}$/, "The code is 6 digits"),
});

export type ConfirmPhoneVerificationInput = z.infer<
  typeof confirmPhoneVerificationInput
>;
