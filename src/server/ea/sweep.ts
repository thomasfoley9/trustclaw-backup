import { db } from "~/server/clients/db";
import { postToEaChannel } from "~/server/clients/slack";
import { EA_CONFIG, isQuietHours } from "./config";
import { claimEvent, standalonePingsToday } from "./events";
import { decideNudges, type LadderTask } from "./ladder";
import { formatNudge } from "./messages";
import { createTask, findTask } from "./task-service";
import { processEaInbound } from "./inbound";
import { runPrepLookahead } from "./prep";
import { buildWatchesFromGmail } from "./watch-builder";
import { runDraftForTask } from "./draft-runner";

// The chase sweep: deterministic code riding the existing 10-minute sweeper.
// No LLM call happens here unless a nudge is actually due and needs its
// deliverable prepared (the draft runner), so a quiet tick costs zero tokens.
// Every send claims its EaEvent fingerprint BEFORE the Slack post, so a
// replayed or overlapping sweep can never double-ping.

export async function runEaSweeps(now: Date): Promise<void> {
  const instances = await db.composioClawInstance.findMany({
    where: { presenceEnabled: true },
    select: {
      id: true,
      eaSlackEnabled: true,
      eaSlackChannelId: true,
      eaSlackCursorTs: true,
      eaSlackOwnerUserId: true,
    },
  });

  for (const instance of instances) {
    try {
      await sweepInstance(instance, now);
    } catch (err) {
      // One instance's failure never takes down the others' sweeps.
      console.error(
        `[ea/sweep] instance ${instance.id} sweep failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

interface SweepInstance {
  id: string;
  eaSlackEnabled: boolean;
  eaSlackChannelId: string | null;
  eaSlackCursorTs: string | null;
  eaSlackOwnerUserId: string | null;
}

async function sweepInstance(
  instance: SweepInstance,
  now: Date,
): Promise<void> {
  // 1. Expired snoozes wake up. ackedAt clears so the ladder can fire again;
  //    the rung is preserved (a snooze pauses the ladder, never resets it).
  await db.eaTask.updateMany({
    where: {
      instanceId: instance.id,
      status: "snoozed",
      snoozedUntil: { lte: now },
    },
    data: { status: "open", snoozedUntil: null, ackedAt: null },
  });

  // 2. Inbound #ea (commands and natural language from the user).
  if (instance.eaSlackEnabled && instance.eaSlackChannelId) {
    await processEaInbound(
      {
        id: instance.id,
        eaSlackChannelId: instance.eaSlackChannelId,
        eaSlackCursorTs: instance.eaSlackCursorTs,
        eaSlackOwnerUserId: instance.eaSlackOwnerUserId,
      },
      now,
    ).catch((err) =>
      console.error(
        `[ea/sweep] inbound failed for ${instance.id}:`,
        err instanceof Error ? err.message : err,
      ),
    );
  }

  // 3. Maintain the watch table from Gmail (Phase 1 polling path).
  await buildWatchesFromGmail(instance.id, now);

  // 4. Watches past their chase window become chase tasks.
  await promoteDueWatches(instance.id, now);

  // 5. Pre-call lookahead (2h horizon, prep task per external meeting).
  await runPrepLookahead(instance.id, now);

  // 6. The ladder decides, the sweep executes.
  if (instance.eaSlackEnabled && instance.eaSlackChannelId) {
    await fireNudges(instance.id, now);
  }
}

async function promoteDueWatches(instanceId: string, now: Date): Promise<void> {
  const dueWatches = await db.eaWatch.findMany({
    where: {
      instanceId,
      state: "watching",
      OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }],
    },
    take: 200,
  });

  let promoted = 0;
  for (const watch of dueWatches) {
    if (promoted >= EA_CONFIG.maxWatchNudgesPerTick) break;
    const silentMs = now.getTime() - watch.lastActivityAt.getTime();
    if (silentMs < watch.chaseAfterHrs * 3_600_000) continue;

    // One open chase task per thread, ever.
    const existing = await db.eaTask.findFirst({
      where: {
        instanceId,
        source: "email",
        sourceRef: watch.ref,
        status: { in: ["open", "waiting", "snoozed"] },
      },
      select: { id: true },
    });
    if (existing) continue;

    const title =
      watch.direction === "they_owe_me"
        ? `Bump ${watch.label}: no reply from them`
        : `Reply owed on ${watch.label}`;

    await createTask(instanceId, {
      title: title.slice(0, 200),
      source: "email",
      priority: "normal",
      sourceRef: watch.ref,
    });
    await db.eaWatch.update({
      where: { id: watch.id },
      data: { state: "nudged", lastNudgedAt: now },
    });
    promoted += 1;
  }
}

async function fireNudges(instanceId: string, now: Date): Promise<void> {
  const rows = await db.eaTask.findMany({
    where: { instanceId, status: { in: ["open", "waiting"] } },
    take: 200,
  });
  const tasks: LadderTask[] = rows.map((t) => ({
    id: t.id,
    shortId: t.shortId,
    title: t.title,
    status: t.status,
    priority: t.priority,
    source: t.source,
    dueAt: t.dueAt,
    snoozedUntil: t.snoozedUntil,
    escalationRung: t.escalationRung,
    lastNudgedAt: t.lastNudgedAt,
    ackedAt: t.ackedAt,
    draftRef: t.draftRef,
  }));

  const { actions } = decideNudges(tasks, {
    now,
    quiet: isQuietHours(now),
    pingsSentToday: await standalonePingsToday(instanceId, now),
  });

  let draftRuns = 0;
  for (const action of actions) {
    // Claim before act: this fingerprint is what makes double-pings
    // impossible. If the claim fails, some other tick already owns this rung.
    const claimed = await claimEvent(
      instanceId,
      `nudge:${action.taskId}:rung${action.toRung}`,
      "nudge_sent",
      { taskId: action.taskId, rung: action.toRung },
    );
    if (!claimed) continue;

    await db.eaTask.update({
      where: { id: action.taskId },
      data: {
        escalationRung: action.toRung,
        lastNudgedAt: now,
        nudgeCount: { increment: 1 },
      },
    });

    // Chase with the work done: a rung-1 email chase without a draft gets one
    // prepared now (the only model spend in the whole sweep), bounded per tick.
    let task = await findTask(instanceId, action.taskId);
    if (
      task &&
      !task.draftRef &&
      task.source === "email" &&
      action.toRung === 1 &&
      draftRuns < EA_CONFIG.maxDraftRunsPerTick
    ) {
      draftRuns += 1;
      task = (await runDraftForTask(instanceId, task)) ?? task;
    }
    if (!task) continue;

    await postToEaChannel(instanceId, formatNudge(task, action.toRung));
  }
}

// Post-brief ladder bump: everything at rung 1 that the brief just carried
// moves to rung 2 ("2nd ask" was delivered inside the brief). Called by the
// cron runner after a successful ea_brief run.
export async function bumpRungsAfterBrief(instanceId: string): Promise<void> {
  await db.eaTask.updateMany({
    where: {
      instanceId,
      status: { in: ["open", "waiting"] },
      escalationRung: 1,
      ackedAt: null,
    },
    data: { escalationRung: 2 },
  });
}

// Re-enable without backfire: ladder timers resume from NOW, and anything
// that would have fired while the switch was off folds into the next brief
// instead of bursting. Tasks already on a rung get their clocks restarted.
export async function pauselessReenable(instanceId: string): Promise<void> {
  await db.eaTask.updateMany({
    where: {
      instanceId,
      status: { in: ["open", "waiting"] },
      escalationRung: { gt: 0 },
    },
    data: { lastNudgedAt: new Date() },
  });
}
