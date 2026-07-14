import { timingSafeEqual } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { db } from "~/server/clients/db";
import { env } from "~/env";
import { encryptSecret, isEncrypted } from "~/server/clients/crypto";
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  isValidUsernameChars,
} from "~/lib/username";
import { getRedis, isRedisConfigured } from "./clients/redis";
import { z } from "zod";

const rateLimitValueSchema = z.object({
  count: z.coerce.number(),
  lastRequest: z.coerce.number(),
});

const redisRateLimitStorage = isRedisConfigured()
  ? {
      customStorage: {
        get: async (key: string) => {
          // Fail open on any Redis/parse failure - a rate-limit store outage
          // must not 500 every auth endpoint.
          try {
            const redis = getRedis();
            const value = redis ? await redis.get(key) : null;
            const parsedValue = value
              ? rateLimitValueSchema.parse(JSON.parse(value))
              : null;
            return {
              key,
              count: parsedValue?.count ?? 0,
              lastRequest: parsedValue?.lastRequest ?? 0,
            };
          } catch (error) {
            console.error("rate-limit storage get failed:", error);
            return undefined;
          }
        },
        set: async (
          key: string,
          value: { count: number; lastRequest: number },
        ) => {
          try {
            const redis = getRedis();
            if (!redis) return;
            // TTL must outlive the longest configured window (900s for
            // /request-password-reset) or counts reset mid-window.
            await redis.set(key, JSON.stringify(value), "EX", 900);
          } catch (error) {
            console.error("rate-limit storage set failed:", error);
          }
        },
      },
    }
  : {};

// Who may CREATE an account. Allowed if ANY of these match:
//   - email on an allowed domain (composio.dev is always allowed; extra domains
//     via ALLOWED_EMAIL_DOMAINS) - applies to BOTH password and Google sign-up.
//   - email on the explicit ALLOWED_EMAILS list ("anyone I tell you").
//   - a valid SIGNUP_INVITE_CODE (password form only, via the x-invite-code
//     header) - lets anyone with the code in regardless of email.
// Enforced in the user.create.before hook so Google sign-up can't slip past the
// email gate (OAuth carries no invite-code header).
// Registration is OPEN to everyone unless SIGNUP_RESTRICTED="true", in which
// case the gate below (allowed domains / emails / invite code) applies.
const signupRestricted = env.SIGNUP_RESTRICTED === "true";

const BASE_ALLOWED_DOMAINS = ["composio.dev"];

const ALLOWED_DOMAINS = Array.from(
  new Set([
    ...BASE_ALLOWED_DOMAINS,
    ...(env.ALLOWED_EMAIL_DOMAINS
      ? env.ALLOWED_EMAIL_DOMAINS.split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean)
      : []),
  ]),
);

const ALLOWED_EMAILS = env.ALLOWED_EMAILS
  ? env.ALLOWED_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  : [];

function emailAllowed(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (ALLOWED_EMAILS.includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  return ALLOWED_DOMAINS.includes(domain);
}

function signupRestrictionMessage(): string {
  const domains = ALLOWED_DOMAINS.map((d) => `@${d}`).join(", ");
  const extra = ALLOWED_EMAILS.length
    ? " (and specifically-invited addresses)"
    : "";
  const code = env.SIGNUP_INVITE_CODE ? " - or enter a valid invite code" : "";
  return `Sign-up is restricted to ${domains}${extra}${code}.`;
}

// Constant-time check of the shared signup code (x-invite-code header). When a
// code is configured and matches, anyone may sign up regardless of email.
function inviteCodeValid(supplied: string): boolean {
  const expected = env.SIGNUP_INVITE_CODE;
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// OAuth provider tokens (Google access/refresh/id) are secrets - encrypt them
// at rest with the same AES-256-GCM envelope as the API keys. The app never
// reads them back (Google tools go through Composio), so encrypt-on-write is
// sufficient; nothing needs to decrypt them.
const ACCOUNT_TOKEN_FIELDS = [
  "accessToken",
  "refreshToken",
  "idToken",
] as const;

function encryptAccountTokens<T extends Record<string, unknown>>(account: T): T {
  const next: Record<string, unknown> = { ...account };
  for (const field of ACCOUNT_TOKEN_FIELDS) {
    const value = next[field];
    if (typeof value === "string" && value.length > 0 && !isEncrypted(value)) {
      next[field] = encryptSecret(value);
    }
  }
  return next as T;
}

const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // Open registration: anyone may create an account. Only when
          // SIGNUP_RESTRICTED is set do we fall back to the gate (a valid invite
          // code on the password form, OR an allowed email - OAuth carries no
          // code header so it relies on the email gate).
          if (!signupRestricted) {
            return { data: user };
          }
          const code = ctx?.headers?.get("x-invite-code")?.trim() ?? "";
          if (inviteCodeValid(code) || emailAllowed(user.email)) {
            return { data: user };
          }
          throw new APIError("FORBIDDEN", {
            message: signupRestrictionMessage(),
          });
        },
      },
    },
    account: {
      create: {
        before: async (account) => ({ data: encryptAccountTokens(account) }),
      },
      update: {
        before: async (account) => ({ data: encryptAccountTokens(account) }),
      },
    },
  },
  trustedOrigins: [
    env.NEXT_PUBLIC_APP_URL,
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      // No email provider is wired in, so the reset link is surfaced in the
      // server logs for this self-hosted instance. To enable real email
      // delivery, replace this body with your provider (Resend / SMTP /
      // Composio Gmail) - it's the only line that needs to change.
      console.warn(
        `\n========== PASSWORD RESET REQUEST ==========\n` +
          `account: ${user.email}\n` +
          `reset link: ${url}\n` +
          `(open this link to set a new password)\n` +
          `============================================\n`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: false,
  },
  plugins: [
    username({
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
      // Override BOTH validators: the plugin's default (/^[a-zA-Z0-9_.]+$/)
      // rejects hyphens, and it validates the normalized username AND the
      // display username separately - so without both, a handle like
      // "casey-5672" fails on the display-name check even if the first passes.
      usernameValidator: isValidUsernameChars,
      displayUsernameValidator: isValidUsernameChars,
    }),
    nextCookies(),
  ],
  session: {
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/username": {
        window: 10,
        max: 5,
      },
      "/sign-up/email": {
        window: 60,
        max: 5,
      },
      // Each request generates a token and prints a reset link to the server
      // log - keep it tight to prevent token churn / log flooding.
      "/request-password-reset": {
        window: 900,
        max: 3,
      },
    },
    ...redisRateLimitStorage,
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
