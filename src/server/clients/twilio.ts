import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "~/env";

// Twilio SMS client, direct REST (no SDK, no Composio dependency) - one
// authenticated POST, same posture as telegram.ts. Ships dark: every
// function no-ops cleanly until the TWILIO_* env vars exist.

export function isTwilioConfigured(): boolean {
  return (
    !!env.TWILIO_ACCOUNT_SID &&
    !!env.TWILIO_AUTH_TOKEN &&
    !!env.TWILIO_FROM_NUMBER
  );
}

// Twilio concatenates up to 1600 chars per message; keep SMS terse anyway.
const SMS_MAX_CHARS = 1600;

// Best-effort outbound: failures log and return false, never throw into a
// sweep or agent loop.
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isTwilioConfigured()) return false;
  try {
    const auth = Buffer.from(
      `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
    ).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: env.TWILIO_FROM_NUMBER!,
          Body: body.slice(0, SMS_MAX_CHARS),
        }),
      },
    );
    if (!response.ok) {
      console.error(`[twilio] send failed: ${response.status}`, {
        to,
        bodyLength: body.length,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[twilio] send error:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// Twilio request signature validation (X-Twilio-Signature): HMAC-SHA1 over
// the full webhook URL plus the form params sorted by key, keyed with the
// auth token. https://www.twilio.com/docs/usage/security#validating-requests
export function isValidTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!env.TWILIO_AUTH_TOKEN) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  const expected = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
