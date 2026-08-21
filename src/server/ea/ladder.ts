import { EA_CONFIG } from "./config";

// The nudge ladder, as pure decisions. No I/O, no model calls: given task
// state and context, decide which nudges fire this tick. The caps live here
// so they are enforced by arithmetic, never by model judgment.
//
// Rungs (PRD section 6):
//   0: task exists, appears in the next brief
//   1: one standalone #ea message, work attached
//   2: folded into the next brief marked "2nd ask" (the brief run bumps 1->2)
//   3: a sharper standalone #ea ping, at least 12h after the last nudge
//   4: SMS (dark until A2P clears - rung 3 is the ceiling until then)
//   5: phone (slice 3)

export interface LadderTask {
  id: string;
  shortId: number;
  title: string;
  status: string;
  priority: string;
  source: string;
  dueAt: Date | null;
  snoozedUntil: Date | null;
  escalationRung: number;
  lastNudgedAt: Date | null;
  ackedAt: Date | null;
  draftRef: string | null;
}

export interface LadderContext {
  now: Date;
  quiet: boolean;
  pingsSentToday: number;
}

export interface NudgeAction {
  taskId: string;
  shortId: number;
  toRung: 1 | 3;
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Watch-born and approval tasks nudge as soon as they exist; everything else
// waits for its due date. Manual tasks with no due date never ping - they
// live in the brief and the ledger.
function isActivated(task: LadderTask, now: Date): boolean {
  if (task.dueAt && task.dueAt.getTime() <= now.getTime()) return true;
  if (task.source === "email" || task.source === "approval") return true;
  if (task.priority === "critical") return true;
  return false;
}

function isSilenced(task: LadderTask, now: Date): boolean {
  // Snooze always wins.
  if (task.snoozedUntil && task.snoozedUntil.getTime() > now.getTime()) {
    return true;
  }
  // Ack means silence: an ack at or after the last nudge stops the ladder.
  if (
    task.ackedAt &&
    (!task.lastNudgedAt || task.ackedAt.getTime() >= task.lastNudgedAt.getTime())
  ) {
    return true;
  }
  return false;
}

export function decideNudges(
  tasks: LadderTask[],
  ctx: LadderContext,
): { actions: NudgeAction[]; deferred: number } {
  // Quiet hours: defer everything. The tasks keep their state; the next
  // non-quiet tick re-decides. Never dropped.
  if (ctx.quiet) return { actions: [], deferred: tasks.length };

  const candidates: NudgeAction[] = [];

  for (const task of tasks) {
    if (task.status !== "open" && task.status !== "waiting") continue;
    if (isSilenced(task, ctx.now)) continue;

    if (task.escalationRung === 0 && isActivated(task, ctx.now)) {
      candidates.push({ taskId: task.id, shortId: task.shortId, toRung: 1 });
      continue;
    }

    if (
      task.escalationRung === 2 &&
      task.lastNudgedAt &&
      ctx.now.getTime() - task.lastNudgedAt.getTime() >=
        EA_CONFIG.rung3MinHoursSinceLastNudge * 60 * 60 * 1000
    ) {
      candidates.push({ taskId: task.id, shortId: task.shortId, toRung: 3 });
    }
  }

  // Priority first, then oldest due date, then lowest shortId for stability.
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  candidates.sort((a, b) => {
    const ta = byTask.get(a.taskId)!;
    const tb = byTask.get(b.taskId)!;
    const pa = PRIORITY_ORDER[ta.priority] ?? 2;
    const pb = PRIORITY_ORDER[tb.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = ta.dueAt?.getTime() ?? Infinity;
    const dbb = tb.dueAt?.getTime() ?? Infinity;
    if (da !== dbb) return da - dbb;
    return ta.shortId - tb.shortId;
  });

  // The daily cap, summed across channels: what's left of the budget today.
  const budget = Math.max(
    0,
    EA_CONFIG.maxStandalonePingsPerDay - ctx.pingsSentToday,
  );
  const actions = candidates.slice(0, budget);
  return { actions, deferred: candidates.length - actions.length };
}
