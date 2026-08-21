import { Prisma } from "~/generated/prisma/client";
import { db } from "~/server/clients/db";
import { eaDayStart } from "./config";

// The EA's idempotency layer. Every side effect claims its fingerprint here
// FIRST; a replayed webhook, a double sweep, or a crashed-and-retried tick
// hits the unique constraint and no-ops. Claim-before-act means the failure
// mode is a missed action (retried at the next rung or tick), never a double.

export type EaEventKind =
  | "email_in"
  | "slack_in"
  | "sms_in"
  | "transcript"
  | "nudge_sent"
  | "slack_out"
  | "sms_out"
  | "call_placed"
  | "blocked_action"
  | "prep_task";

// Returns true if this fingerprint was newly claimed, false if already seen.
export async function claimEvent(
  instanceId: string,
  fingerprint: string,
  kind: EaEventKind,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await db.eaEvent.create({
      data: {
        instanceId,
        fingerprint,
        kind,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return false;
    }
    throw err;
  }
}

export async function wasSeen(
  instanceId: string,
  fingerprint: string,
): Promise<boolean> {
  const row = await db.eaEvent.findUnique({
    where: { instanceId_fingerprint: { instanceId, fingerprint } },
    select: { id: true },
  });
  return row !== null;
}

// Standalone pings sent since PT midnight - the value the daily cap checks.
export async function standalonePingsToday(
  instanceId: string,
  now: Date,
): Promise<number> {
  return db.eaEvent.count({
    where: {
      instanceId,
      kind: "nudge_sent",
      createdAt: { gte: eaDayStart(now) },
    },
  });
}
