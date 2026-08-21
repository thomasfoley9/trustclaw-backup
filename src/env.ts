import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Better Auth
    BETTER_AUTH_SECRET: z.string(),

    // Secret-at-rest encryption for per-user Composio keys (AES-256-GCM).
    // 32 bytes, hex or base64. Optional: when unset, keys are stored as
    // plaintext (fine for local dev); set it in any shared/cloud deploy.
    // Generate with: openssl rand -base64 32
    ENCRYPTION_KEY: z.string().optional(),

    // Telegram bot (optional - Telegram features disabled when missing)
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_BOT_USERNAME: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

    // Twilio SMS (optional - the EA's SMS door ships dark and lights up when
    // these are set). AUTH_TOKEN doubles as the webhook signature secret.
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis (optional - resumable streams disabled when missing; basic streaming still works)
    REDIS_URL: z.string().optional(),

    // Route long-running jobs (cron today; more later) to the standalone worker
    // queue instead of running them inline on Vercel. Requires REDIS_URL + a
    // running worker. Unset/"false" = inline execution (current behavior), so
    // prod is unchanged until the worker is deployed and this is set to "true".
    WORKER_QUEUE_ENABLED: z.enum(["true", "false"]).optional(),

    // QStash push scheduling (optional). When set, each cron job's next fire
    // is a precise QStash one-shot message instead of waiting for the daily
    // sweeper; the sweeper stays on as the self-healing backstop. Signing keys
    // authenticate inbound QStash deliveries.
    QSTASH_TOKEN: z.string().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

    // Owner-funded keys for the "house" models (Kimi K2, DeepSeek) - free to
    // every user, billed to the owner. Each house model prefers its native key
    // (DeepSeek / Moonshot) and falls back to the shared OpenRouter key. All
    // optional; a house model is unavailable when it has neither.
    OPENROUTER_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    MOONSHOT_API_KEY: z.string().optional(),

    // Owner-funded shared Smallest.ai (voice/TTS) key - every user gets spoken
    // replies without bringing their own. A per-user voice key still overrides it.
    SMALLEST_API_KEY: z.string().optional(),

    // Owner's PLATFORM Composio key for shared multi-tenant mode: users get
    // tools without bringing a key, each isolated under a namespaced Composio
    // user id ("trustclaw_<appUserId>") - see server/clients/composio.ts.
    // A per-user BYO key still overrides it. Optional: without it, BYO keys
    // are required (self-hosted mode).
    COMPOSIO_API_KEY: z.string().optional(),

    // Real-time voice (LiveKit). API key/secret mint room-join JWTs in the token
    // route. VOICE_WORKER_SHARED_SECRET authenticates the LiveKit Python worker
    // when it calls /api/voice-turn. All optional - voice is opt-in.
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
    VOICE_WORKER_SHARED_SECRET: z.string().optional(),

    // Cron auth. Required in production so unauthenticated callers can't hit
    // /api/cron/* endpoints. Vercel auto-injects this when crons are configured
    // in vercel.json; the trustclaw deploy CLI also generates one on first deploy.
    CRON_SECRET: z.string(),

    // Google social sign-in (optional). When both are set, a "Continue with
    // Google" button appears. Create an OAuth client in Google Cloud and add
    // the redirect URI <app-url>/api/auth/callback/google.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Sign-up gate. Account creation is allowed if ANY of these match:
    //   ALLOWED_EMAIL_DOMAINS: comma-separated domains (composio.dev is always
    //     allowed regardless). Applies to BOTH Google and password sign-up.
    //   ALLOWED_EMAILS: comma-separated specific addresses ("anyone I tell you").
    //   SIGNUP_INVITE_CODE: a shared code that lets ANYONE sign up with the
    //     password form (sent as the x-invite-code header) regardless of email.
    ALLOWED_EMAIL_DOMAINS: z.string().optional(),
    ALLOWED_EMAILS: z.string().optional(),
    SIGNUP_INVITE_CODE: z.string().optional(),
    // Registration is OPEN to everyone by default. Set SIGNUP_RESTRICTED="true"
    // to re-gate sign-up behind the allowed domains / emails / invite code.
    SIGNUP_RESTRICTED: z.enum(["true", "false"]).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    // LiveKit project URL (wss://...). The browser needs it to join the room.
    NEXT_PUBLIC_LIVEKIT_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    // Server
    NODE_ENV: process.env.NODE_ENV,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    // Legacy fallbacks: these credentials were first added under short names
    // (`sid` / `authtokentwilio` / `outnumber`). Vercel marks them Sensitive,
    // which makes the values unreadable and the KEYS unrenameable, so the code
    // accepts either name. Canonical names win; drop the fallbacks once the
    // vars are re-added as TWILIO_*.
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ?? process.env.sid,
    TWILIO_AUTH_TOKEN:
      process.env.TWILIO_AUTH_TOKEN ?? process.env.authtokentwilio,
    TWILIO_FROM_NUMBER:
      process.env.TWILIO_FROM_NUMBER ?? process.env.outnumber,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    WORKER_QUEUE_ENABLED: process.env.WORKER_QUEUE_ENABLED,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
    SMALLEST_API_KEY: process.env.SMALLEST_API_KEY,
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    VOICE_WORKER_SHARED_SECRET: process.env.VOICE_WORKER_SHARED_SECRET,
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    SIGNUP_INVITE_CODE: process.env.SIGNUP_INVITE_CODE,
    SIGNUP_RESTRICTED: process.env.SIGNUP_RESTRICTED,

    // Client URL resolution:
    //  - dev: derive from PORT so `PORT=3001 pnpm dev` just works
    //  - prod with explicit override: use NEXT_PUBLIC_APP_URL
    //  - on Vercel: fall back to the auto-injected canonical URL so self-hosters
    //    don't need to set anything (VERCEL_PROJECT_PRODUCTION_URL is the
    //    stable production domain; VERCEL_URL is the per-deployment URL)
    NEXT_PUBLIC_APP_URL:
      process.env.NODE_ENV === "development"
        ? `http://localhost:${process.env.PORT ?? "3000"}`
        : process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : undefined),
  },
  // SKIP_ENV_VALIDATION is for local lint/typecheck without a full .env.
  // Never honour it in production - security-critical secrets like
  // CRON_SECRET and BETTER_AUTH_SECRET must always be present at runtime.
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION &&
    process.env.NODE_ENV !== "production",
  emptyStringAsUndefined: true,
});
