import { zodSchema } from "ai";
import type { Tool } from "ai";
import {
  createTask,
  completeTask,
  snoozeTask,
  killTask,
  listTasks,
} from "~/server/ea/task-service";
import { eaTaskSchema, type EaTaskInput } from "./ea-task.schema";

function parseIsoDate(value: string): Date | null {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export function createEaTaskTool(
  instanceId: string,
): Tool<EaTaskInput, Record<string, unknown>> {
  return {
    description:
      "The EA task ledger: create, complete, snooze, kill, or list tracked tasks (public IDs like T-14)",
    inputSchema: zodSchema(eaTaskSchema),
    execute: async ({
      action,
      title,
      source,
      priority,
      dueAt,
      sourceRef,
      draftRef,
      taskId,
      snoozeUntil,
      filter,
    }) => {
      switch (action) {
        case "create": {
          if (!title) {
            return { error: "'title' is required for create" };
          }
          let due: Date | undefined;
          if (dueAt) {
            const parsed = parseIsoDate(dueAt);
            if (!parsed) {
              return {
                error:
                  "'dueAt' must be a valid ISO 8601 date-time. Resolve relative dates before calling.",
              };
            }
            due = parsed;
          }
          const task = await createTask(instanceId, {
            title,
            source: source ?? "manual",
            priority,
            dueAt: due,
            sourceRef,
            draftRef,
          });
          return { created: true, task };
        }

        case "complete": {
          if (!taskId) {
            return { error: "'taskId' is required for complete" };
          }
          const task = await completeTask(instanceId, taskId);
          if (!task) return { error: `No task found for '${taskId}'` };
          return { completed: true, task };
        }

        case "snooze": {
          if (!taskId) {
            return { error: "'taskId' is required for snooze" };
          }
          if (!snoozeUntil) {
            return { error: "'snoozeUntil' is required for snooze" };
          }
          const until = parseIsoDate(snoozeUntil);
          if (!until) {
            return {
              error:
                "'snoozeUntil' must be a valid ISO 8601 date-time. Resolve relative dates before calling.",
            };
          }
          if (until.getTime() <= Date.now()) {
            return { error: "'snoozeUntil' must be in the future" };
          }
          const task = await snoozeTask(instanceId, taskId, until);
          if (!task) return { error: `No task found for '${taskId}'` };
          return { snoozed: true, task };
        }

        case "kill": {
          if (!taskId) {
            return { error: "'taskId' is required for kill" };
          }
          const task = await killTask(instanceId, taskId);
          if (!task) return { error: `No task found for '${taskId}'` };
          return { killed: true, task };
        }

        case "list": {
          const tasks = await listTasks(instanceId, filter ?? "due");
          return { filter: filter ?? "due", count: tasks.length, tasks };
        }
      }
    },
  };
}
