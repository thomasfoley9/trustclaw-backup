import moment from "moment-timezone";
import { EA_CONFIG } from "./config";

// The reply grammar. Deliberately tiny: a handful of verbs parsed by code so
// ledger effects are deterministic. Anything that doesn't parse goes to the
// full agent as natural language - the grammar is a fast path, not a wall.

export type ParsedReply =
  | { kind: "done"; taskRef: string | null }
  | { kind: "kill"; taskRef: string | null }
  | { kind: "snooze"; taskRef: string | null; until: Date }
  | { kind: "draft"; taskRef: string | null }
  | { kind: "send_ready"; taskRef: string | null }
  | { kind: "whats_due" };

const TASK_REF = /\b(?:t[-\s]?)?(\d{1,5})\b/i;

function extractTaskRef(text: string): string | null {
  const match = TASK_REF.exec(text);
  return match?.[1] ? `T-${match[1]}` : null;
}

// Resolve a relative snooze phrase to a concrete PT timestamp. Returns null
// when the phrase isn't understood (the whole message then falls through to
// the agent, which can resolve fancier dates itself).
export function resolveSnoozeUntil(
  phrase: string,
  now: Date,
  timezone: string = EA_CONFIG.timezone,
): Date | null {
  const local = moment.tz(now, timezone);
  const p = phrase.trim().toLowerCase();

  if (/^(tomorrow|tmrw)$/.test(p)) {
    return local.clone().add(1, "day").hour(9).minute(0).second(0).toDate();
  }
  if (/^tonight$/.test(p)) {
    return local.clone().hour(19).minute(0).second(0).toDate();
  }
  if (/^next week$/.test(p)) {
    return local
      .clone()
      .add(1, "week")
      .isoWeekday(1)
      .hour(9)
      .minute(0)
      .second(0)
      .toDate();
  }

  const weekday =
    /^(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)$/.exec(
      p,
    );
  if (weekday?.[1]) {
    const target = moment.tz(weekday[1], "dddd", timezone).isoWeekday();
    const result = local.clone().isoWeekday(target).hour(9).minute(0).second(0);
    if (!result.isAfter(local)) result.add(1, "week");
    return result.toDate();
  }

  const inUnits = /^(\d+)\s*(hour|hours|hr|hrs|h|day|days|d|week|weeks|w)$/.exec(p);
  if (inUnits?.[1] && inUnits[2]) {
    const n = parseInt(inUnits[1], 10);
    const unit = inUnits[2].startsWith("h")
      ? "hours"
      : inUnits[2].startsWith("d")
        ? "days"
        : "weeks";
    return local.clone().add(n, unit).toDate();
  }

  const clock = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(p);
  if (clock?.[1]) {
    let hour = parseInt(clock[1], 10) % 12;
    if (clock[3] === "pm") hour += 12;
    const result = local
      .clone()
      .hour(hour)
      .minute(clock[2] ? parseInt(clock[2], 10) : 0)
      .second(0);
    if (!result.isAfter(local)) result.add(1, "day");
    return result.toDate();
  }
  if (/^noon$/.test(p)) {
    const result = local.clone().hour(12).minute(0).second(0);
    if (!result.isAfter(local)) result.add(1, "day");
    return result.toDate();
  }

  return null;
}

export function parseReply(text: string, now: Date): ParsedReply | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200) return null;
  const lower = trimmed.toLowerCase();

  if (/^what'?s?\s+(due|open|outstanding)\??$/.test(lower)) {
    return { kind: "whats_due" };
  }

  if (/^done\b/.test(lower) || /^\bdid it\b/.test(lower)) {
    return { kind: "done", taskRef: extractTaskRef(lower) };
  }

  if (/^(kill( it)?|cancel( it)?|drop( it)?)\b/.test(lower)) {
    return { kind: "kill", taskRef: extractTaskRef(lower) };
  }

  if (/^send[- ]?ready\b/.test(lower)) {
    return { kind: "send_ready", taskRef: extractTaskRef(lower) };
  }

  if (/^draft( it)?\b/.test(lower)) {
    return { kind: "draft", taskRef: extractTaskRef(lower) };
  }

  const snooze = /^snooze\s*(?:t[-\s]?\d{1,5})?\s*(?:til|till|until|to)?\s*(.*)$/.exec(
    lower,
  );
  if (snooze) {
    const phrase = (snooze[1] ?? "").trim() || "tomorrow";
    const until = resolveSnoozeUntil(phrase, now);
    if (until) {
      return { kind: "snooze", taskRef: extractTaskRef(lower), until };
    }
    return null; // fancy date - let the agent handle it
  }

  return null;
}
