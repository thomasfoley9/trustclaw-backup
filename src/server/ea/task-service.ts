import { db } from "~/server/clients/db";

// EA task ledger service. The single write path for EaTask rows: the ea_task
// agent tool, the reply-grammar parser, and the chase sweep all go through
// these functions so ledger semantics never fork between surfaces.

export type TaskListFilter = "due" | "open" | "waiting" | "snoozed" | "all";

const OPEN_STATUSES = ["open", "waiting"];

// How far ahead "due" looks. Overdue tasks are always included.
const DUE_HORIZON_MS = 24 * 60 * 60 * 1000;

export function formatShortId(shortId: number): string {
  return `T-${shortId}`;
}

// Accepts "T-14", "t14", "14", or an internal cuid. Never parses titles.
export function parseTaskRef(
  ref: string,
): { shortId: number } | { id: string } | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const match = /^t[-\s]?(\d+)$/i.exec(trimmed) ?? /^(\d+)$/.exec(trimmed);
  if (match?.[1]) return { shortId: parseInt(match[1], 10) };
  if (/^c[a-z0-9]{20,}$/i.test(trimmed)) return { id: trimmed };
  return null;
}

const taskSelect = {
  id: true,
  shortId: true,
  title: true,
  status: true,
  priority: true,
  dueAt: true,
  snoozedUntil: true,
  source: true,
  sourceRef: true,
  draftRef: true,
  lastNudgedAt: true,
  nudgeCount: true,
  escalationRung: true,
  createdAt: true,
  updatedAt: true,
} as const;

type TaskRow = {
  id: string;
  shortId: number;
  title: string;
  status: string;
  priority: string;
  dueAt: Date | null;
  snoozedUntil: Date | null;
  source: string;
  sourceRef: string | null;
  draftRef: string | null;
  lastNudgedAt: Date | null;
  nudgeCount: number;
  escalationRung: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface TaskView {
  taskId: string;
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  snoozedUntil: string | null;
  source: string;
  sourceRef: string | null;
  draftRef: string | null;
  nudgeCount: number;
  escalationRung: number;
  createdAt: string;
  updatedAt: string;
}

export function toTaskView(task: TaskRow): TaskView {
  return {
    taskId: formatShortId(task.shortId),
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    source: task.source,
    sourceRef: task.sourceRef,
    draftRef: task.draftRef,
    nudgeCount: task.nudgeCount,
    escalationRung: task.escalationRung,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export interface CreateTaskInput {
  title: string;
  source: string;
  priority?: string;
  status?: string;
  dueAt?: Date;
  sourceRef?: string;
  draftRef?: string;
}

// Short IDs come from an atomic counter bump on the instance row, so two
// concurrent creates can never mint the same number. A create that fails
// after the bump burns a number; gaps are fine, duplicates are not.
export async function createTask(
  instanceId: string,
  input: CreateTaskInput,
): Promise<TaskView> {
  const { eaTaskCounter } = await db.composioClawInstance.update({
    where: { id: instanceId },
    data: { eaTaskCounter: { increment: 1 } },
    select: { eaTaskCounter: true },
  });

  const task = await db.eaTask.create({
    data: {
      instanceId,
      shortId: eaTaskCounter,
      title: input.title,
      source: input.source,
      priority: input.priority ?? "normal",
      status: input.status ?? "open",
      dueAt: input.dueAt,
      sourceRef: input.sourceRef,
      draftRef: input.draftRef,
    },
    select: taskSelect,
  });

  return toTaskView(task);
}

export async function findTask(
  instanceId: string,
  ref: string,
): Promise<TaskView | null> {
  const parsed = parseTaskRef(ref);
  if (!parsed) return null;
  const task = await db.eaTask.findFirst({
    where: { instanceId, ...parsed },
    select: taskSelect,
  });
  return task ? toTaskView(task) : null;
}

async function transition(
  instanceId: string,
  ref: string,
  data: Record<string, unknown>,
): Promise<TaskView | null> {
  const parsed = parseTaskRef(ref);
  if (!parsed) return null;
  const existing = await db.eaTask.findFirst({
    where: { instanceId, ...parsed },
    select: { id: true },
  });
  if (!existing) return null;
  const task = await db.eaTask.update({
    where: { id: existing.id },
    data,
    select: taskSelect,
  });
  return toTaskView(task);
}

export async function completeTask(
  instanceId: string,
  ref: string,
): Promise<TaskView | null> {
  return transition(instanceId, ref, {
    status: "done",
    ackedAt: new Date(),
    snoozedUntil: null,
  });
}

export async function snoozeTask(
  instanceId: string,
  ref: string,
  until: Date,
): Promise<TaskView | null> {
  return transition(instanceId, ref, {
    status: "snoozed",
    snoozedUntil: until,
    ackedAt: new Date(),
  });
}

export async function killTask(
  instanceId: string,
  ref: string,
): Promise<TaskView | null> {
  return transition(instanceId, ref, {
    status: "killed",
    ackedAt: new Date(),
    snoozedUntil: null,
  });
}

// Attach prepared work (a Gmail draft id or doc URL) to a task. Called by the
// agent after it builds the deliverable, so the next nudge ships with the
// work attached.
export async function attachDraft(
  instanceId: string,
  ref: string,
  draftRef: string,
): Promise<TaskView | null> {
  return transition(instanceId, ref, { draftRef });
}

export async function listTasks(
  instanceId: string,
  filter: TaskListFilter = "due",
  now: Date = new Date(),
): Promise<TaskView[]> {
  const where: Record<string, unknown> = { instanceId };

  switch (filter) {
    case "due":
      where.status = { in: OPEN_STATUSES };
      where.dueAt = { lte: new Date(now.getTime() + DUE_HORIZON_MS) };
      break;
    case "open":
      where.status = { in: OPEN_STATUSES };
      break;
    case "waiting":
      where.status = "waiting";
      break;
    case "snoozed":
      where.status = "snoozed";
      break;
    case "all":
      break;
  }

  const tasks = await db.eaTask.findMany({
    where,
    select: taskSelect,
    orderBy:
      filter === "all" ? { createdAt: "desc" } : [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: 50,
  });

  return tasks.map(toTaskView);
}
