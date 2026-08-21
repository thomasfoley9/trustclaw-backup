import type { TaskView } from "./task-service";

// Every user-facing EA string in one place. Style contract: concise,
// friendly, no em dashes, no AI slop. These render in #ea (and later SMS),
// so they are written for a phone screen, not a terminal.

export function formatNudge(task: TaskView, rung: 1 | 3): string {
  const age = task.dueAt
    ? ageLine(new Date(task.dueAt))
    : ageLine(new Date(task.createdAt));

  const workLine = task.draftRef
    ? `Draft's ready. Reply "send-ready ${task.taskId}" and it goes out.`
    : `Reply "draft it ${task.taskId}" and I'll prep it.`;

  if (rung === 3) {
    return `${task.taskId}: ${task.title}\n3rd ask${age ? `, ${age}` : ""}. Kill it or clear it.\n${workLine}`;
  }
  return `${task.taskId}: ${task.title}${age ? `\n${age}.` : ""}\n${workLine}`;
}

function ageLine(since: Date): string {
  const hours = Math.floor((Date.now() - since.getTime()) / 3_600_000);
  if (hours < 1) return "";
  if (hours < 24) return `${hours}h old`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} old`;
}

export function formatTaskList(tasks: TaskView[], filter: string): string {
  if (tasks.length === 0) {
    return filter === "due"
      ? "Nothing due. You're clean."
      : `No ${filter} tasks.`;
  }
  const lines = tasks.slice(0, 10).map((t) => {
    const bits = [`${t.taskId}: ${t.title}`];
    if (t.status === "waiting") bits.push("(their move)");
    if (t.status === "snoozed" && t.snoozedUntil) {
      bits.push(`(snoozed til ${t.snoozedUntil.slice(0, 10)})`);
    }
    if (t.draftRef) bits.push("(draft ready)");
    return bits.join(" ");
  });
  const more = tasks.length > 10 ? `\n+${tasks.length - 10} more` : "";
  return lines.join("\n") + more;
}

export function formatAck(action: string, task: TaskView | null): string {
  if (!task) return "Couldn't find that task. Say \"what's due\" to see the list.";
  switch (action) {
    case "done":
      return `${task.taskId} done.`;
    case "kill":
      return `${task.taskId} killed. It won't come back.`;
    case "snooze":
      return `${task.taskId} snoozed til ${task.snoozedUntil?.slice(0, 16).replace("T", " ") ?? "later"}.`;
    default:
      return `${task.taskId} updated.`;
  }
}
