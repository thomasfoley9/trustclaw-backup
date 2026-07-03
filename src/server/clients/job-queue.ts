import { Queue, Worker, type Job, type Processor } from "bullmq";
import Redis from "ioredis";
import { env } from "~/env";
import type { MessageSource } from "~/server/api/routers/trustclaw/agent/setup";
import type { CronJobRow } from "~/app/api/cron/trustclaw/execute/route.schema";

// BullMQ requires its Redis connections to use `maxRetriesPerRequest: null` -
// its blocking commands (BRPOPLPUSH etc.) must not be torn down by ioredis's
// retry logic. This is a SEPARATE connection from the app's getRedis() (which
// uses maxRetriesPerRequest: 3 for normal commands). Created lazily so importing
// this module never opens a socket until something actually enqueues - the
// Next.js serverless app imports the producer side but doesn't connect until it
// enqueues; the worker process gets its own blocking connection.
function createQueueConnection(): Redis {
  if (!env.REDIS_URL) {
    throw new Error("Job queue requires REDIS_URL");
  }
  const r = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  r.on("error", (err) => console.error("[job-queue] redis error:", err));
  return r;
}

const globalForQueue = globalThis as typeof globalThis & {
  agentQueue: Queue<QueueJobData> | undefined;
  agentQueueConn: Redis | undefined;
};

export const AGENT_QUEUE_NAME = "agent-jobs";

/** A normal agent turn (web background / future voice). */
export interface AgentJobData {
  kind: "agent";
  instanceId: string;
  userId: string;
  userMessage: string;
  source: MessageSource;
  conversationId?: string;
  // Secrets and file bytes are deliberately NOT carried on the queue: the
  // worker re-fetches and decrypts the user's keys job-scoped (see plan §5A).
}

/** A batch of due cron jobs for one instance, with their fencing context. */
export interface CronJobData {
  kind: "cron";
  jobs: CronJobRow[];
  invocationId: string;
  nowOverride?: string;
}

export type QueueJobData = AgentJobData | CronJobData;

/**
 * True when long-running jobs should be routed to the worker queue. Requires
 * both the explicit flag AND a configured Redis - so a half-configured deploy
 * (flag on, no Redis) safely falls back to inline execution instead of
 * silently dropping work.
 */
export function isWorkerQueueEnabled(): boolean {
  return env.WORKER_QUEUE_ENABLED === "true" && !!env.REDIS_URL;
}

/** Producer-side queue handle, or null when Redis isn't configured. */
export function getAgentQueue(): Queue<QueueJobData> | null {
  if (!env.REDIS_URL) return null;
  globalForQueue.agentQueueConn ??= createQueueConnection();
  const queue =
    globalForQueue.agentQueue ??
    new Queue<QueueJobData>(AGENT_QUEUE_NAME, {
      connection: globalForQueue.agentQueueConn,
    });
  globalForQueue.agentQueue = queue;
  return queue;
}

// BullMQ forbids ':' in custom job ids (it's BullMQ's internal Redis key
// separator), so we normalize ':' -> '_'. The transform is deterministic, so
// idempotency still holds across retried enqueues of the same logical id.
//
// `attempts: 1` - no auto-retry until the confirm/idempotency work (plan §5B,
// Phase 4) makes re-execution of a partially-completed run provably safe.
async function enqueue(jobId: string, data: QueueJobData): Promise<string> {
  const queue = getAgentQueue();
  if (!queue) {
    throw new Error("Job queue unavailable (REDIS_URL unset)");
  }
  const safeId = jobId.replace(/:/g, "_");
  await queue.add(data.kind, data, {
    jobId: safeId,
    attempts: 1,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  });
  return safeId;
}

/**
 * Enqueue a normal agent job. `jobId` is the idempotency key (e.g.
 * "sessionId:turnId"): BullMQ refuses a second job with an existing id, so a
 * retried enqueue can't double-run a side-effectful tool. Returns the id used.
 *
 * SECURITY (Phase 3 gate): the worker trusts this payload and does NOT re-check
 * that `userId` owns `instanceId`. No user-facing caller enqueues today (only
 * the CRON_SECRET-gated cron dispatch). Before any web/voice endpoint calls
 * this, it MUST first assert instance ownership (as the chat route does at
 * route.ts) - otherwise a forged request could run an agent under another
 * user's instance.
 */
export function enqueueAgentJob(
  jobId: string,
  data: Omit<AgentJobData, "kind">,
): Promise<string> {
  return enqueue(jobId, { kind: "agent", ...data });
}

/**
 * Enqueue a batch of due cron jobs. `jobId` should be the dispatch's
 * invocationId so a retried dispatch dedupes to a single run.
 */
export function enqueueCronJob(
  jobId: string,
  data: Omit<CronJobData, "kind">,
): Promise<string> {
  return enqueue(jobId, { kind: "cron", ...data });
}

/**
 * Worker-side factory. Runs in the standalone worker process - never in the
 * Next.js serverless app. Each worker gets its own dedicated blocking
 * connection, as BullMQ requires.
 */
export function createAgentWorker(
  processor: Processor<QueueJobData, void>,
): Worker<QueueJobData, void> {
  return new Worker<QueueJobData, void>(AGENT_QUEUE_NAME, processor, {
    connection: createQueueConnection(),
  });
}

export type AgentJob = Job<QueueJobData, void>;
