import { Queue, Worker, type Job, type Processor } from "bullmq";
import Redis from "ioredis";
import { env } from "~/env";
import type { MessageSource } from "~/server/api/routers/trustclaw/agent/setup";

// BullMQ requires its Redis connections to use `maxRetriesPerRequest: null` —
// its blocking commands (BRPOPLPUSH etc.) must not be torn down by ioredis's
// retry logic. This is a SEPARATE connection from the app's getRedis() (which
// uses maxRetriesPerRequest: 3 for normal commands). Created lazily so importing
// this module never opens a socket until something actually enqueues — the
// Next.js serverless app imports the producer side but doesn't connect until it
// enqueues; the worker process (Phase 2) gets its own blocking connection.
function createQueueConnection(): Redis {
  if (!env.REDIS_URL) {
    throw new Error("Job queue requires REDIS_URL");
  }
  const r = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  r.on("error", (err) => console.error("[job-queue] redis error:", err));
  return r;
}

const globalForQueue = globalThis as typeof globalThis & {
  agentQueue: Queue<AgentJobData> | undefined;
  agentQueueConn: Redis | undefined;
};

export const AGENT_QUEUE_NAME = "agent-jobs";

export interface AgentJobData {
  instanceId: string;
  userId: string;
  userMessage: string;
  source: MessageSource;
  conversationId?: string;
  // Secrets and file bytes are deliberately NOT carried on the queue: the
  // worker re-fetches and decrypts the user's keys job-scoped (see plan §5A).
}

/** Producer-side queue handle, or null when Redis isn't configured. */
export function getAgentQueue(): Queue<AgentJobData> | null {
  if (!env.REDIS_URL) return null;
  globalForQueue.agentQueueConn ??= createQueueConnection();
  const queue =
    globalForQueue.agentQueue ??
    new Queue<AgentJobData>(AGENT_QUEUE_NAME, {
      connection: globalForQueue.agentQueueConn,
    });
  globalForQueue.agentQueue = queue;
  return queue;
}

/**
 * Enqueue an agent job. `jobId` is the idempotency key (e.g. "sessionId:turnId"):
 * BullMQ refuses a second job with an id that already exists, so a retried
 * enqueue can't double-run a side-effectful tool. Returns the actual id used.
 *
 * BullMQ forbids ':' in custom job ids (it's BullMQ's internal Redis key
 * separator), so we normalize ':' -> '_'. The transform is deterministic, so
 * idempotency still holds across retried enqueues of the same logical id.
 *
 * `attempts: 1` — no auto-retry until the confirm/idempotency work (plan §5B,
 * Phase 4) makes re-execution of a partially-completed run provably safe.
 */
export async function enqueueAgentJob(
  jobId: string,
  data: AgentJobData,
): Promise<string> {
  const queue = getAgentQueue();
  if (!queue) {
    throw new Error("Job queue unavailable (REDIS_URL unset)");
  }
  const safeId = jobId.replace(/:/g, "_");
  await queue.add("run", data, {
    jobId: safeId,
    attempts: 1,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  });
  return safeId;
}

/**
 * Worker-side factory. Runs in the standalone worker process (Phase 2) — never
 * in the Next.js serverless app. Each worker gets its own dedicated blocking
 * connection, as BullMQ requires.
 */
export function createAgentWorker(
  processor: Processor<AgentJobData, void>,
): Worker<AgentJobData, void> {
  return new Worker<AgentJobData, void>(AGENT_QUEUE_NAME, processor, {
    connection: createQueueConnection(),
  });
}

export type AgentJob = Job<AgentJobData, void>;
