import { describe, expect, it } from "vitest";
import { decideNudges, type LadderTask } from "./ladder";

const NOW = new Date("2026-08-19T17:00:00Z");

function task(overrides: Partial<LadderTask> = {}): LadderTask {
  return {
    id: `id_${overrides.shortId ?? 1}`,
    shortId: 1,
    title: "task",
    status: "open",
    priority: "normal",
    source: "email",
    dueAt: null,
    snoozedUntil: null,
    escalationRung: 0,
    lastNudgedAt: null,
    ackedAt: null,
    draftRef: null,
    ...overrides,
  };
}

describe("decideNudges", () => {
  it("rung 0 email tasks fire rung 1 immediately", () => {
    const { actions } = decideNudges([task()], {
      now: NOW,
      quiet: false,
      pingsSentToday: 0,
    });
    expect(actions).toEqual([{ taskId: "id_1", shortId: 1, toRung: 1 }]);
  });

  it("manual tasks with no due date never ping", () => {
    const { actions } = decideNudges([task({ source: "manual" })], {
      now: NOW,
      quiet: false,
      pingsSentToday: 0,
    });
    expect(actions).toEqual([]);
  });

  it("manual tasks fire once due", () => {
    const { actions } = decideNudges(
      [task({ source: "manual", dueAt: new Date(NOW.getTime() - 1000) })],
      { now: NOW, quiet: false, pingsSentToday: 0 },
    );
    expect(actions).toHaveLength(1);
  });

  it("a task already on rung 1 never re-fires rung 1", () => {
    const { actions } = decideNudges(
      [task({ escalationRung: 1, lastNudgedAt: new Date(NOW.getTime() - 60_000) })],
      { now: NOW, quiet: false, pingsSentToday: 0 },
    );
    expect(actions).toEqual([]);
  });

  it("rung 2 escalates to rung 3 only after the cool-off", () => {
    const recent = task({
      escalationRung: 2,
      lastNudgedAt: new Date(NOW.getTime() - 2 * 3600_000),
    });
    const old = task({
      shortId: 2,
      escalationRung: 2,
      lastNudgedAt: new Date(NOW.getTime() - 13 * 3600_000),
    });
    const { actions } = decideNudges([recent, old], {
      now: NOW,
      quiet: false,
      pingsSentToday: 0,
    });
    expect(actions).toEqual([{ taskId: "id_2", shortId: 2, toRung: 3 }]);
  });

  it("snooze always wins", () => {
    const { actions } = decideNudges(
      [task({ snoozedUntil: new Date(NOW.getTime() + 3600_000) })],
      { now: NOW, quiet: false, pingsSentToday: 0 },
    );
    expect(actions).toEqual([]);
  });

  it("ack means silence", () => {
    const { actions } = decideNudges(
      [
        task({
          escalationRung: 2,
          lastNudgedAt: new Date(NOW.getTime() - 24 * 3600_000),
          ackedAt: new Date(NOW.getTime() - 3600_000),
        }),
      ],
      { now: NOW, quiet: false, pingsSentToday: 0 },
    );
    expect(actions).toEqual([]);
  });

  it("quiet hours defer everything, dropping nothing", () => {
    const tasks = [task(), task({ shortId: 2, id: "id_2" })];
    const { actions, deferred } = decideNudges(tasks, {
      now: NOW,
      quiet: true,
      pingsSentToday: 0,
    });
    expect(actions).toEqual([]);
    expect(deferred).toBe(2);
  });

  it("never exceeds 5 standalone pings across a simulated day", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task({ shortId: i + 1, id: `id_${i + 1}` }),
    );
    let sent = 0;
    // Simulate every sweep tick of a day; each fired nudge moves its task off
    // rung 0 (so it can't re-fire) and counts against the day's budget.
    const state = new Map(tasks.map((t) => [t.id, t]));
    for (let tick = 0; tick < 144; tick++) {
      const { actions } = decideNudges([...state.values()], {
        now: NOW,
        quiet: false,
        pingsSentToday: sent,
      });
      for (const a of actions) {
        sent += 1;
        const t = state.get(a.taskId)!;
        state.set(a.taskId, {
          ...t,
          escalationRung: a.toRung,
          lastNudgedAt: NOW,
        });
      }
    }
    expect(sent).toBe(5);
  });

  it("spends the budget on the highest priority first", () => {
    const low = task({ shortId: 1, id: "id_1", priority: "low" });
    const critical = task({ shortId: 2, id: "id_2", priority: "critical" });
    const { actions } = decideNudges([low, critical], {
      now: NOW,
      quiet: false,
      pingsSentToday: 4, // one slot left today
    });
    expect(actions).toEqual([{ taskId: "id_2", shortId: 2, toRung: 1 }]);
  });
});
