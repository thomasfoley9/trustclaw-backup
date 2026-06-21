import { db } from "~/server/clients/db";

// Background-run tracking.
//
// Visibility (which sessions have a run in flight) lives in the DB
// (Conversation.activeRunStartedAt) so it works across processes and
// serverless instances. Abort controllers are in-memory: stop is best-effort
// and only reaches a run living in the same process - acceptable, since the
// run self-terminates at the model's natural end or maxDuration anyway.

// A run older than this is considered dead regardless of the DB flag
// (function crashed/froze before clearing it).
export const RUN_STALE_MS = 5 * 60 * 1000;

const controllers = new Map<string, AbortController>();

// Atomically claim the session's run slot. Returns null when another run is
// already in flight (fresh flag) - the conditional update makes concurrent
// claims race-safe: exactly one wins.
export async function tryClaimRun(
  conversationId: string,
): Promise<AbortController | null> {
  const claimed = await db.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [
        { activeRunStartedAt: null },
        { activeRunStartedAt: { lt: new Date(Date.now() - RUN_STALE_MS) } },
      ],
    },
    data: { activeRunStartedAt: new Date() },
  });
  if (claimed.count === 0) {
    return null;
  }
  const controller = new AbortController();
  controllers.set(conversationId, controller);
  return controller;
}

export async function markRunEnded(conversationId: string): Promise<void> {
  controllers.delete(conversationId);
  await db.conversation
    .update({
      where: { id: conversationId },
      data: { activeRunStartedAt: null },
    })
    .catch((err) => {
      // Best-effort (don't rethrow — the run already finished), but not silent:
      // a failure here strands the run flag until RUN_STALE_MS, blocking the
      // conversation. Surface it so DB trouble is visible to operators.
      console.error(
        `[run-registry] failed to clear run flag for ${conversationId}:`,
        err instanceof Error ? err.message : err,
      );
    });
}

export function abortRun(conversationId: string): boolean {
  const controller = controllers.get(conversationId);
  if (controller) {
    controller.abort();
    controllers.delete(conversationId);
    return true;
  }
  return false;
}

export function isRunActiveHere(conversationId: string): boolean {
  return controllers.has(conversationId);
}

export function runIsFresh(startedAt: Date | null): boolean {
  return !!startedAt && Date.now() - startedAt.getTime() < RUN_STALE_MS;
}
