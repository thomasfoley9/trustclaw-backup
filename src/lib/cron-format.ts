// dayjs (not moment): this module is imported by client components, and
// moment here would drag ~70KB gzipped into their bundles.
import dayjs from "~/lib/dayjs";

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

  // Only plain-integer minute/hour fields can be phrased in English. Step,
  // range, and list syntax ("*/5", "1-5", "0,30") would render as garbage
  // like "Every hour at :*/5", so fall back to the raw expression for those.
  const isPlain = (v: string) => /^\d+$/.test(v);
  if (!isPlain(minute) || !(hour === "*" || isPlain(hour))) {
    return expression;
  }

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
  return dayjs(date).format("MMM D, h:mm A");
}
