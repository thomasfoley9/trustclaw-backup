import { timingSafeEqual } from "node:crypto";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import { processEaInbound } from "~/server/ea/inbound";

// Fast inbound reader for Presence Mode.
//
// The 10-minute chase sweep (/api/cron/trustclaw) is the right cadence for
// nudges and briefs, but far too slow for CONVERSATION: a Slack reply would
// sit unanswered for up to ten minutes. This endpoint runs every minute and
// does one thing - read #ea and act on the owner's messages.
//
// ENGAGED MODE: a conversation is a burst, not a poll. An idle tick does ONE
// read and exits (cheap). The moment a message is consumed, this invocation
// stays hot, re-reading every few seconds so the back-and-forth feels live,
// and stands down after IDLE_EXIT_MS of silence.
//
// That "only engage after seeing traffic" rule is also the overlap guard: the
// hot loop keeps consuming messages, so the next minute's invocation finds
// nothing new and exits immediately instead of stacking a second loop.
export const maxDuration = 300;

const POLL_INTERVAL_MS = 5_000;
const IDLE_EXIT_MS = 90_000; // stay engaged until 90s of silence
const BUDGET_MS = 240_000; // headroom inside maxDuration

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FastInstance {
  id: string;
  eaSlackChannelId: string;
  eaSlackCursorTs: string | null;
  eaSlackOwnerUserId: string | null;
}

// One read across every live instance. Returns true if any consumed a message
// (the cursor moving is the cheapest true signal that someone is talking).
async function readOnce(instances: FastInstance[]): Promise<boolean> {
  let activity = false;
  for (const instance of instances) {
    const before = instance.eaSlackCursorTs;
    try {
      await processEaInbound(
        {
          id: instance.id,
          eaSlackChannelId: instance.eaSlackChannelId,
          eaSlackCursorTs: instance.eaSlackCursorTs,
          eaSlackOwnerUserId: instance.eaSlackOwnerUserId,
        },
        new Date(),
      );
    } catch (err) {
      console.error(
        `[ea/fast] inbound failed for ${instance.id}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    const fresh = await db.composioClawInstance.findUnique({
      where: { id: instance.id },
      select: { eaSlackCursorTs: true },
    });
    if (fresh && fresh.eaSlackCursorTs !== before) {
      instance.eaSlackCursorTs = fresh.eaSlackCursorTs;
      activity = true;
    }
  }
  return activity;
}

export async function GET(request: Request) {
  if (env.NODE_ENV !== "development") {
    if (typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length === 0) {
      return new Response("Server misconfigured: CRON_SECRET missing", {
        status: 503,
      });
    }
    const auth = request.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const rows = await db.composioClawInstance.findMany({
    where: { presenceEnabled: true, eaSlackEnabled: true },
    select: {
      id: true,
      eaSlackChannelId: true,
      eaSlackCursorTs: true,
      eaSlackOwnerUserId: true,
    },
  });
  const instances: FastInstance[] = rows.flatMap((r) =>
    r.eaSlackChannelId
      ? [{ ...r, eaSlackChannelId: r.eaSlackChannelId }]
      : [],
  );
  if (instances.length === 0) {
    return Response.json({ instances: 0, engaged: false, passes: 0 });
  }

  const started = Date.now();
  let passes = 1;
  const engaged = await readOnce(instances);

  if (engaged) {
    let lastActivityAt = Date.now();
    while (
      Date.now() - lastActivityAt < IDLE_EXIT_MS &&
      Date.now() - started < BUDGET_MS
    ) {
      await sleep(POLL_INTERVAL_MS);
      passes += 1;
      if (await readOnce(instances)) lastActivityAt = Date.now();
    }
  }

  return Response.json({
    instances: instances.length,
    passes,
    engaged,
    heldMs: Date.now() - started,
  });
}
