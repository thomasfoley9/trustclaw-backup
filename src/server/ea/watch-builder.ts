import { db } from "~/server/clients/db";
import {
  executeComposio,
  asArray,
  asRecord,
  asString,
} from "./composio-exec";
import { EA_CONFIG } from "./config";

// Phase 1 population path for EaWatch: a bounded Gmail delta scan each sweep
// tick (rides the existing sweeper; retired by the slice 2 Gmail trigger).
// One thread = one watch. Direction is whoever spoke last: I spoke last means
// they owe me; they spoke last means I owe them. Any new activity restarts
// the silence clock, re-arms a nudged watch, and closes open chase tasks for
// that thread (the ball moved; a new cycle re-creates them if it stalls).

interface ThreadActivity {
  threadId: string;
  subject: string;
  lastAt: Date;
  iSpokeLast: boolean;
}

export async function buildWatchesFromGmail(
  instanceId: string,
  now: Date,
): Promise<void> {
  let result;
  try {
    result = await executeComposio(instanceId, "GMAIL_FETCH_EMAILS", {
      query: "newer_than:1d -in:chats -in:spam -in:trash",
      max_results: 25,
      include_payload: false,
    });
  } catch (err) {
    console.error(
      "[ea/watch-builder] gmail fetch error:",
      err instanceof Error ? err.message : err,
    );
    return;
  }
  if (!result.successful) {
    console.error("[ea/watch-builder] gmail fetch failed:", result.error);
    return;
  }

  const threads = new Map<string, ThreadActivity>();
  for (const raw of asArray(result.data.messages)) {
    const msg = asRecord(raw);
    if (!msg) continue;
    const threadId = asString(msg.threadId) ?? asString(msg.thread_id);
    if (!threadId) continue;

    const labelIds = asArray(msg.labelIds).filter(
      (l): l is string => typeof l === "string",
    );
    if (labelIds.includes("DRAFT")) continue;

    const tsRaw =
      asString(msg.messageTimestamp) ?? asString(msg.internalDate);
    const at = tsRaw ? new Date(/^\d+$/.test(tsRaw) ? Number(tsRaw) : tsRaw) : now;
    if (isNaN(at.getTime())) continue;

    const subject = asString(msg.subject) ?? "(no subject)";
    const iSpoke = labelIds.includes("SENT");

    const existing = threads.get(threadId);
    if (!existing || at.getTime() > existing.lastAt.getTime()) {
      threads.set(threadId, {
        threadId,
        subject,
        lastAt: at,
        iSpokeLast: iSpoke,
      });
    }
  }

  for (const t of threads.values()) {
    const direction = t.iSpokeLast ? "they_owe_me" : "i_owe_them";
    try {
      const existing = await db.eaWatch.findUnique({
        where: {
          instanceId_kind_ref: {
            instanceId,
            kind: "thread",
            ref: t.threadId,
          },
        },
        select: { id: true, lastActivityAt: true },
      });

      if (!existing) {
        await db.eaWatch.create({
          data: {
            instanceId,
            kind: "thread",
            ref: t.threadId,
            label: t.subject.slice(0, 200),
            direction,
            lastActivityAt: t.lastAt,
            chaseAfterHrs: EA_CONFIG.chaseAfterHrsDefault,
          },
        });
        continue;
      }

      if (t.lastAt.getTime() > existing.lastActivityAt.getTime()) {
        // Fresh activity: new owner, clock restarts, a nudged watch re-arms.
        await db.eaWatch.update({
          where: { id: existing.id },
          data: {
            direction,
            lastActivityAt: t.lastAt,
            state: "watching",
            label: t.subject.slice(0, 200),
          },
        });
        // The ball moved: chase tasks born before this activity are answered.
        await db.eaTask.updateMany({
          where: {
            instanceId,
            source: "email",
            sourceRef: t.threadId,
            status: { in: ["open", "waiting"] },
            createdAt: { lt: t.lastAt },
          },
          data: { status: "done", ackedAt: now },
        });
      }
    } catch (err) {
      console.error(
        `[ea/watch-builder] upsert failed for thread ${t.threadId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
