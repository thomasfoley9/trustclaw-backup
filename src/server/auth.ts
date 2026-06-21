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
        },
        set: async (
          key: string,
          value: { count: number; lastRequest: number },
        ) => {
          const redis = getRedis();
          if (!redis) return;
          await redis.set(key, JSON.stringify(value), "EX", 60);
        },
      },
    }
  : {};

// Who may CREATE an account. There is NO invite code — this allowlist is the
// gate, and it's closed by construction: composio.dev is always allowed (this
// instance's home domain), so even if the env vars below are unset the gate
// never falls open to the world. Env vars only ADD on top:
//   ALLOWED_EMAIL_DOMAINS — extra comma-separated domains.
//   ALLOWED_EMAILS        — extra specific addresses ("anyone I tell you").
// Enforced in the user.create.before hook, which runs for BOTH password and
// Google sign-up, so social login can't slip past it.
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
  return `Sign-up is restricted to ${domains}${extra}.`;
}

// OAuth provider tokens (Google access/refresh/id) are secrets — encrypt them
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
        before: async (user) => {
          if (!emailAllowed(user.email)) {
            throw new APIError("FORBIDDEN", {
              message: signupRestrictionMessage(),
            });
          }
          return { data: user };
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
      // Composio Gmail) — it's the only line that needs to change.
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
      // display username separately — so without both, a handle like
      // "thomas-5672" fails on the display-name check even if the first passes.
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
