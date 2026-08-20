import { env } from "~/env";
import { db } from "~/server/clients/db";

// QStash as a precise, durable one-shot timer for cron jobs.
//
// Instead of translating user-timezone cron expressions into QStash's cron
// syntax (DST-lossy), the app keeps computing `nextRunAt` with the existing
// timezone-aware croner logic and publishes ONE delayed QStash message per
// upcoming fire, targeting /api/cron/qstash. After each run the next fire is
// scheduled. QStash brings exact-minute delivery, retries with backoff, and a
// DLQ; the daily Vercel sweeper stays on as the self-healing backstop (it
// picks up any job whose chain broke), and atomic lock claims make the two
// paths race-safe.
//
// Everything here is env-gated: without QSTASH_TOKEN the functions no-op and
// the sweeper remains the only scheduler (today's behavior).

const QSTASH_BASE = "https://qstash.upstash.io/v2";

export function isQstashEnabled(): boolean {
  return !!env.QSTASH_TOKEN && !!env.NEXT_PUBLIC_APP_URL;
}

function deliveryUrl(): string {
  return `${env.NEXT_PUBLIC_APP_URL}/api/cron/qstash`;
}

/**
 * Publish the job's next fire as a delayed one-shot message and remember the
 * message id (so disable/delete can cancel it). Cancels any previously
 * scheduled fire first, so edits and manual runs can't double-schedule.
 * Best-effort: a QStash hiccup leaves the job to the sweeper backstop.
 */
export async function scheduleNextFire(
  jobId: string,
  nextRunAt: Date | null,
): Promise<void> {
  if (!isQstashEnabled()) return;

  try {
    await cancelScheduledFire(jobId);
    if (!nextRunAt) return;

    // Only schedule fires for jobs that still exist and are enabled.
    const job = await db.cronJob.findUnique({
      where: { id: jobId },
      select: { enabled: true },
    });
    if (!job?.enabled) return;

    const res = await fetch(
      `${QSTASH_BASE}/publish/${encodeURIComponent(deliveryUrl())}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.QSTASH_TOKEN}`,
          "Content-Type": "application/json",
          // Absolute delivery time (unix seconds). QStash fires at this
          // moment; retries with backoff on non-2xx.
          "Upstash-Not-Before": String(
            Math.floor(nextRunAt.getTime() / 1000),
          ),
          "Upstash-Retries": "3",
          // Dedupe: one outstanding fire per job per scheduled minute.
          "Upstash-Deduplication-Id": `${jobId}:${nextRunAt.getTime()}`,
        },
        body: JSON.stringify({ jobId }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      console.error(
        `[qstash] schedule failed for job ${jobId}: ${res.status} ${await res
          .text()
          .catch(() => "")}`,
      );
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      messageId?: string;
    } | null;
    if (data?.messageId) {
      await db.cronJob
        .update({
          where: { id: jobId },
          data: { qstashMessageId: data.messageId },
        })
        .catch(() => undefined); // job deleted in the meantime - fine
    }
  } catch (error) {
    // Never let scheduling problems break the run that triggered them - the
    // sweeper will still fire the job, just less punctually.
    console.error(`[qstash] scheduleNextFire failed for job ${jobId}:`, error);
  }
}

/**
 * Cancel the job's pending one-shot (disable, delete, or reschedule). Safe to
 * call when nothing is scheduled.
 */
export async function cancelScheduledFire(jobId: string): Promise<void> {
  if (!isQstashEnabled()) return;

  const job = await db.cronJob
    .findUnique({ where: { id: jobId }, select: { qstashMessageId: true } })
    .catch(() => null);
  const messageId = job?.qstashMessageId;
  if (!messageId) return;

  try {
    // 404 = already delivered or expired - equally "not pending anymore".
    await fetch(`${QSTASH_BASE}/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.QSTASH_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`[qstash] cancel failed for job ${jobId}:`, error);
  }
  await db.cronJob
    .update({ where: { id: jobId }, data: { qstashMessageId: null } })
    .catch(() => undefined);
}

/**
 * Verify an inbound QStash delivery signature (JWT in Upstash-Signature).
 * Checks against both current and next signing keys to survive rotation.
 */
export async function verifyQstashSignature(
  signature: string,
  body: string,
  url: string,
): Promise<boolean> {
  const keys = [
    env.QSTASH_CURRENT_SIGNING_KEY,
    env.QSTASH_NEXT_SIGNING_KEY,
  ].filter((k): k is string => !!k);
  if (keys.length === 0 || !signature) return false;

  const { Receiver } = await import("@upstash/qstash");
  for (const key of keys) {
    try {
      const receiver = new Receiver({
        currentSigningKey: key,
        nextSigningKey: key,
      });
      const ok = await receiver.verify({ signature, body, url });
      if (ok) return true;
    } catch {
      // try the next key
    }
  }
  return false;
}
