import moment from "moment";

// Human-readable rendering of a 5-field cron expression. Falls back to the
// raw expression for patterns it doesn't special-case.
export function formatCronExpression(expression: string): string {
  const parts = expression.split(" ");
  if (parts.length !== 5) return expression;

  const minute = parts[0] ?? "0";
  const hour = parts[1] ?? "*";
  const dayOfMonth = parts[2] ?? "*";
  const month = parts[3] ?? "*";
  const dayOfWeek = parts[4] ?? "*";

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    if (minute === "0" && hour === "*") return "Every hour";
    if (hour === "*") return `Every hour at :${minute.padStart(2, "0")}`;
    return `Daily at ${hour}:${minute.padStart(2, "0")}`;
  }

  if (dayOfWeek !== "*" && dayOfMonth === "*" && month === "*") {
    const days: Record<string, string> = {
      "0": "Sunday",
      "1": "Monday",
      "2": "Tuesday",
      "3": "Wednesday",
      "4": "Thursday",
      "5": "Friday",
      "6": "Saturday",
    };
    const dayName = days[dayOfWeek] ?? dayOfWeek;
    return `Every ${dayName} at ${hour}:${minute.padStart(2, "0")}`;
  }

  return expression;
}

export function formatCronDate(date: Date | string | null): string {
  if (!date) return "-";
  return moment(date).format("MMM D, h:mm A");
}
