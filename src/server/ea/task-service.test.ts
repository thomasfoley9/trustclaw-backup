import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  composioClawInstance: { update: vi.fn() },
  eaTask: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("~/server/clients/db", () => ({ db: mockDb }));

import {
  createTask,
  completeTask,
  snoozeTask,
  killTask,
  listTasks,
  parseTaskRef,
  formatShortId,
} from "./task-service";

const INSTANCE = "inst_1";

// Typed views over the untyped mock call args, per the no-any house rule.
interface TaskWriteArgs {
  data: {
    shortId?: number;
    priority?: string;
    status?: string;
    ackedAt?: Date | null;
    snoozedUntil?: Date | null;
  };
}

interface TaskFindManyArgs {
  where: {
    instanceId: string;
    status?: { in: string[] } | string;
    dueAt?: { lte: Date };
  };
  orderBy: object;
}

const createArgs = () =>
  mockDb.eaTask.create.mock.calls[0]?.[0] as TaskWriteArgs;
const updateArgs = () =>
  mockDb.eaTask.update.mock.calls[0]?.[0] as TaskWriteArgs;
const findManyArgs = () =>
  mockDb.eaTask.findMany.mock.calls[0]?.[0] as TaskFindManyArgs;

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cme000000000000000000001",
    shortId: 14,
    title: "Send Dmitry the one-pager",
    status: "open",
    priority: "normal",
    dueAt: null,
    snoozedUntil: null,
    source: "promise",
    sourceRef: "thread_abc",
    draftRef: null,
    lastNudgedAt: null,
    nudgeCount: 0,
    escalationRung: 0,
    createdAt: new Date("2026-08-20T10:00:00Z"),
    updatedAt: new Date("2026-08-20T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseTaskRef", () => {
  it("parses public ID forms to shortId", () => {
    expect(parseTaskRef("T-14")).toEqual({ shortId: 14 });
    expect(parseTaskRef("t14")).toEqual({ shortId: 14 });
    expect(parseTaskRef(" 14 ")).toEqual({ shortId: 14 });
    expect(parseTaskRef("T 14")).toEqual({ shortId: 14 });
  });

  it("passes cuids through as internal ids", () => {
    expect(parseTaskRef("cme000000000000000000001")).toEqual({
      id: "cme000000000000000000001",
    });
  });

  it("rejects garbage instead of guessing", () => {
    expect(parseTaskRef("")).toBeNull();
    expect(parseTaskRef("the dmitry task")).toBeNull();
    expect(parseTaskRef("T-")).toBeNull();
  });
});

describe("createTask", () => {
  it("mints the shortId from the atomic instance counter", async () => {
    mockDb.composioClawInstance.update.mockResolvedValue({ eaTaskCounter: 15 });
    mockDb.eaTask.create.mockResolvedValue(taskRow({ shortId: 15 }));

    const task = await createTask(INSTANCE, {
      title: "Send Dmitry the one-pager",
      source: "promise",
    });

    expect(mockDb.composioClawInstance.update).toHaveBeenCalledWith({
      where: { id: INSTANCE },
      data: { eaTaskCounter: { increment: 1 } },
      select: { eaTaskCounter: true },
    });
    expect(createArgs().data.shortId).toBe(15);
    expect(task.taskId).toBe("T-15");
  });

  it("defaults priority to normal and status to open", async () => {
    mockDb.composioClawInstance.update.mockResolvedValue({ eaTaskCounter: 1 });
    mockDb.eaTask.create.mockResolvedValue(taskRow({ shortId: 1 }));

    await createTask(INSTANCE, { title: "x", source: "manual" });

    const data = createArgs().data;
    expect(data.priority).toBe("normal");
    expect(data.status).toBe("open");
  });
});

describe("transitions", () => {
  it("complete sets done + ackedAt and clears snooze", async () => {
    mockDb.eaTask.findFirst.mockResolvedValue({ id: "task_1" });
    mockDb.eaTask.update.mockResolvedValue(taskRow({ status: "done" }));

    const task = await completeTask(INSTANCE, "T-14");

    expect(mockDb.eaTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: INSTANCE, shortId: 14 },
      }),
    );
    const data = updateArgs().data;
    expect(data.status).toBe("done");
    expect(data.ackedAt).toBeInstanceOf(Date);
    expect(data.snoozedUntil).toBeNull();
    expect(task?.status).toBe("done");
  });

  it("snooze sets snoozedUntil", async () => {
    const until = new Date("2026-08-22T16:00:00Z");
    mockDb.eaTask.findFirst.mockResolvedValue({ id: "task_1" });
    mockDb.eaTask.update.mockResolvedValue(
      taskRow({ status: "snoozed", snoozedUntil: until }),
    );

    const task = await snoozeTask(INSTANCE, "14", until);

    const data = updateArgs().data;
    expect(data.status).toBe("snoozed");
    expect(data.snoozedUntil).toBe(until);
    expect(task?.snoozedUntil).toBe(until.toISOString());
  });

  it("kill sets killed", async () => {
    mockDb.eaTask.findFirst.mockResolvedValue({ id: "task_1" });
    mockDb.eaTask.update.mockResolvedValue(taskRow({ status: "killed" }));

    const task = await killTask(INSTANCE, "T-14");
    expect(updateArgs().data.status).toBe("killed");
    expect(task?.status).toBe("killed");
  });

  it("returns null for a task that does not exist (never updates)", async () => {
    mockDb.eaTask.findFirst.mockResolvedValue(null);
    const task = await completeTask(INSTANCE, "T-999");
    expect(task).toBeNull();
    expect(mockDb.eaTask.update).not.toHaveBeenCalled();
  });

  it("returns null for an unparseable ref (never updates)", async () => {
    const task = await completeTask(INSTANCE, "that thing");
    expect(task).toBeNull();
    expect(mockDb.eaTask.findFirst).not.toHaveBeenCalled();
  });
});

describe("listTasks", () => {
  it("'due' filters open statuses within the 24h horizon", async () => {
    mockDb.eaTask.findMany.mockResolvedValue([taskRow()]);
    const now = new Date("2026-08-20T12:00:00Z");

    await listTasks(INSTANCE, "due", now);

    const where = findManyArgs().where;
    expect(where.status).toEqual({ in: ["open", "waiting"] });
    expect(where.dueAt?.lte).toEqual(new Date("2026-08-21T12:00:00Z"));
  });

  it("'all' has no status filter and sorts newest first", async () => {
    mockDb.eaTask.findMany.mockResolvedValue([]);
    await listTasks(INSTANCE, "all");
    const call = findManyArgs();
    expect(call.where).toEqual({ instanceId: INSTANCE });
    expect(call.orderBy).toEqual({ createdAt: "desc" });
  });

  it("renders public IDs on every row", async () => {
    mockDb.eaTask.findMany.mockResolvedValue([
      taskRow({ shortId: 3 }),
      taskRow({ shortId: 7 }),
    ]);
    const tasks = await listTasks(INSTANCE, "open");
    expect(tasks.map((t) => t.taskId)).toEqual(["T-3", "T-7"]);
  });
});

describe("formatShortId", () => {
  it("is the single source of the public format", () => {
    expect(formatShortId(14)).toBe("T-14");
  });
});
