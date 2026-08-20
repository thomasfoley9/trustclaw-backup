import { z } from "zod";

export const eaTaskSchema = z.object({
  action: z
    .enum(["create", "complete", "snooze", "kill", "list"])
    .describe("The action to perform on the task ledger"),
  title: z
    .string()
    .optional()
    .describe("Task title (required for create). Short and specific."),
  source: z
    .enum(["call", "email", "promise", "prep", "manual", "approval"])
    .optional()
    .describe(
      "Where the task was born (create only). Defaults to 'manual' for tasks the user asks for directly.",
    ),
  priority: z
    .enum(["low", "normal", "high", "critical"])
    .optional()
    .describe("Task priority (create only). Defaults to 'normal'."),
  dueAt: z
    .string()
    .optional()
    .describe(
      "Due date-time as an ISO 8601 string (create only). Resolve relative phrases like 'thursday' to a concrete timestamp in the user's timezone before calling.",
    ),
  sourceRef: z
    .string()
    .optional()
    .describe(
      "Reference to the task's origin: Fireflies transcript id, Gmail thread id, or SFDC opportunity id (create only)",
    ),
  draftRef: z
    .string()
    .optional()
    .describe(
      "Reference to attached prepared work: a Gmail draft id or doc URL (create only)",
    ),
  taskId: z
    .string()
    .optional()
    .describe(
      "Task to act on (required for complete, snooze, kill). Accepts the public ID ('T-14' or '14') or the internal id.",
    ),
  snoozeUntil: z
    .string()
    .optional()
    .describe(
      "When the task should resurface, ISO 8601 (required for snooze). Resolve relative phrases to a concrete timestamp first.",
    ),
  filter: z
    .enum(["due", "open", "waiting", "snoozed", "all"])
    .optional()
    .describe(
      "List filter (list only). 'due' = open tasks due within 24h or overdue (the default), 'open' = everything not done/killed/snoozed, 'waiting' = blocked on someone else, 'snoozed', 'all'.",
    ),
});

export type EaTaskInput = z.infer<typeof eaTaskSchema>;
