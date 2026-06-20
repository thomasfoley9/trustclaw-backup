import Redis from "ioredis";
import { env } from "~/env";

// ─── Redis Client ────────────────────────────────────────────────────────────

const globalForRedis = globalThis as typeof globalThis & {
  redis: Redis | undefined;
  redisSubscriber: Redis | undefined;
  redisPublisher: Redis | undefined;
};

export function isRedisConfigured(): boolean {
  return !!env.REDIS_URL;
}

function createRedis(): Redis {
  if (!env.REDIS_URL) {
    throw new Error("Redis not configured");
  }
  const r = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  // ioredis crashes the process on unhandled error events. Surface them in
  // logs instead so connection issues are still visible.
  r.on("error", (err) => {
    console.error("[redis] connection error:", err);
  });
  return r;
}

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  globalForRedis.redis ??= createRedis();
  return globalForRedis.redis;
}

/** Dedicated subscriber connection for pub/sub (enters subscriber mode). */
export function getRedisSubscriber(): Redis | null {
  if (!env.REDIS_URL) return null;
  globalForRedis.redisSubscriber ??= createRedis();
  return globalForRedis.redisSubscriber;
}

/** Dedicated publisher connection for pub/sub. */
export function getRedisPublisher(): Redis | null {
  if (!env.REDIS_URL) return null;
  globalForRedis.redisPublisher ??= createRedis();
  return globalForRedis.redisPublisher;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STREAMING_KEY_TTL = 600; // 10 minutes

// ─── Streaming Message Tracker ──────────────────────────────────────────────

export async function setStreamingMessage(
  instanceId: string,
  streamId: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(`streaming:${instanceId}`, streamId, "EX", STREAMING_KEY_TTL);
}

export async function getStreamingMessage(
  instanceId: string,
): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get(`streaming:${instanceId}`);
}

export async function clearStreamingMessage(
  instanceId: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(`streaming:${instanceId}`);
}

// ─── Telegram Deduplication ─────────────────────────────────────────────────

const TELEGRAM_DEDUP_TTL = 300; // 5 minutes

/**
 * Attempt to claim a Telegram update for processing.
 * Returns true if this is the first time we've seen this update_id
 * (i.e. we should process it). Returns false if it's a duplicate/retry.
 */
export async function claimTelegramUpdate(
  updateId: number,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // no dedup available - always claim
  const result = await r.set(
    `telegram-update:${updateId}`,
    "1",
    "EX",
    TELEGRAM_DEDUP_TTL,
    "NX",
  );
  return result === "OK";
}

// ─── Telegram Active Generation Tracking ──────────────────────────────────

const TELEGRAM_ACTIVE_TTL = 600; // 10 minutes

/**
 * Mark a Telegram update as the active generation for an instance.
 * A newer update arriving will overwrite this, signaling the old one to abort.
 */
export async function setTelegramActive(
  instanceId: string,
  updateId: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(
    `telegram-active:${instanceId}`,
    String(updateId),
    "EX",
    TELEGRAM_ACTIVE_TTL,
  );
}

/**
 * Get the currently active Telegram update ID for an instance.
 * Returns null if no active generation.
 */
export async function getTelegramActive(
  instanceId: string,
): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  const val = await r.get(`telegram-active:${instanceId}`);
  return val ? Number(val) : null;
}

// ─── Sliding-Window Rate Limiter ────────────────────────────────────────────

// Atomic check-and-record in one Lua script (Redis runs it single-threaded, so
// there's no check-then-act race across concurrent requests): drop timestamps
// older than the window, count what remains, and record the new request only
// when it's under the limit — so a rejected request never extends its own
// window. Sorted-set scores are request timestamps (ms); the key self-expires
// after the window so idle instances leave nothing behind.
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxReq = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count >= maxReq then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return 1
`;

/**
 * Distributed sliding-window rate limit shared across all server instances.
 * Returns true if the request is allowed, false if the limit is exceeded.
 *
 * Fail-open: if Redis is unconfigured or errors, returns true so an infra
 * hiccup can never block legitimate traffic. Callers wanting stricter degraded
 * behavior should gate on isRedisConfigured() and fall back themselves.
 */
export async function slidingWindowAllow(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;
  try {
    const now = Date.now();
    const member = `${now}-${crypto.randomUUID()}`;
    const result = await r.eval(
      RATE_LIMIT_LUA,
      1,
      `ratelimit:${key}`,
      String(now),
      String(windowMs),
      String(maxRequests),
      member,
    );
    return result === 1 || result === "1";
  } catch (err) {
    console.error("[redis] rate-limit check failed (allowing):", err);
    return true;
  }
}
