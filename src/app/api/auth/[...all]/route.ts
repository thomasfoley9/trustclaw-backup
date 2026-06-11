import { timingSafeEqual, createHash } from "crypto";
import { auth } from "~/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { env } from "~/env";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

// Brute-force throttle for invite-code attempts (better-auth's own rate limit
// only fires AFTER our gate, so failed codes need their own counter).
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;
const failedAttempts = new Map<string, number[]>();

function tooManyFailures(ip: string): boolean {
  const now = Date.now();
  const fails = (failedAttempts.get(ip) ?? []).filter(
    (t) => now - t < FAIL_WINDOW_MS,
  );
  failedAttempts.set(ip, fails);
  return fails.length >= FAIL_MAX;
}

function recordFailure(ip: string): void {
  const fails = failedAttempts.get(ip) ?? [];
  fails.push(Date.now());
  failedAttempts.set(ip, fails);
}

function codesMatch(supplied: string, expected: string): boolean {
  // Hash both sides to fixed length so timingSafeEqual is usable regardless
  // of input length, keeping the comparison constant-time.
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Single-tenant cell gate: when SIGNUP_INVITE_CODE is configured, account
// registration requires the matching code (sent as the x-invite-code header).
// Sign-in and all other auth routes are unaffected, so existing members keep
// working and the cell stays closed to strangers.
export const POST = async (request: Request) => {
  if (env.SIGNUP_INVITE_CODE) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sign-up/email")) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown";
      if (tooManyFailures(ip)) {
        return Response.json(
          { message: "Too many invite-code attempts. Try again later." },
          { status: 429 },
        );
      }
      const supplied = request.headers.get("x-invite-code") ?? "";
      if (!codesMatch(supplied, env.SIGNUP_INVITE_CODE)) {
        recordFailure(ip);
        return Response.json(
          { message: "Invite code required. Ask your team admin for one." },
          { status: 403 },
        );
      }
    }
  }
  return handlers.POST(request);
};
