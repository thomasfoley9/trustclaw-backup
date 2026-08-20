import { Cron } from "croner";

export function computeNextRunAt(expression: string, timezone: string): Date {
  const cron = new Cron(expression, { timezone });
  const next = cron.nextRun();
  if (!next) {
    throw new Error("Invalid cron expression or no future runs");
  }
  return next;
}

export function computeNextRunSafe(expression: string, timezone: string): Date | null {
  try {
    return computeNextRunAt(expression, timezone);
  } catch {
    return null;
  }
}

export function validateCronExpression(expression: string): boolean {
  try {
    new Cron(expression);
    return true;
  } catch {
    return false;
  }
}

// Owner-funded house-model runs are free to every user, so an agent-created
// job firing every minute (`* * * * *`) is an unbounded spend vector. Floor
// the cadence at 15 minutes: reject any expression whose two soonest runs are
// closer together than this.
export const MIN_CRON_INTERVAL_MS = 15 * 60 * 1000;

export function meetsMinInterval(
  expression: string,
  timezone: string,
): boolean {
  try {
    const cron = new Cron(expression, { timezone });
    const first = cron.nextRun();
    if (!first) return false;
    const second = cron.nextRun(first);
    if (!second) return true; // one-shot / no repeat - nothing to throttle
    return second.getTime() - first.getTime() >= MIN_CRON_INTERVAL_MS;
  } catch {
    return false;
  }
}
