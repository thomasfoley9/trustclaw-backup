import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { db } from "~/server/clients/db";
import { env } from "~/env";
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

// Email domains allowed to CREATE an account. When set, applies to BOTH
// Google and password sign-up so social login can't slip past the invite gate.
const ALLOWED_DOMAINS = env.ALLOWED_EMAIL_DOMAINS
  ? env.ALLOWED_EMAIL_DOMAINS.split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
  : null;

function emailDomainAllowed(email: string): boolean {
  if (!ALLOWED_DOMAINS) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return ALLOWED_DOMAINS.includes(domain);
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
          if (!emailDomainAllowed(user.email)) {
            throw new APIError("FORBIDDEN", {
              message: `Sign-up is restricted to ${ALLOWED_DOMAINS?.join(", ")} accounts.`,
            });
          }
          return { data: user };
        },
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
