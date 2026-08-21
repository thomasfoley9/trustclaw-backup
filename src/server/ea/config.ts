import moment from "moment-timezone";

// All EA tunables in one place. These are behavior constants from the PRD
// (section 6); changing cadence or caps happens here, never inline.
export const EA_CONFIG = {
  timezone: "America/Los_Angeles",

  // Quiet hours: 9:00pm to 6:30am PT. Nudges are deferred, never dropped.
  quietStartHour: 21,
  quietEndHour: 6,
  quietEndMinute: 30,

  // Hard cap on standalone pings per day, summed across every channel.
  // Overflow batches into the next brief.
  maxStandalonePingsPerDay: 5,

  // Dropped-ball chase window (hours of thread silence).
  chaseAfterHrsDefault: 24,

  // Daily brief schedule (7:00am PT).
  briefCron: "0 7 * * *",

  // Rung 2 -> 3 requires at least this long since the last nudge, so the
  // "sharper ping" lands the next morning, not an hour later.
  rung3MinHoursSinceLastNudge: 12,

  // Pre-call lookahead horizon.
  prepLookaheadMs: 2 * 60 * 60 * 1000,

  // Bounded work per sweep tick. Anything beyond handles next tick.
  maxWatchNudgesPerTick: 5,
  maxDraftRunsPerTick: 2,
  maxInboundMessagesPerTick: 10,
} as const;

export function isQuietHours(
  now: Date,
  timezone: string = EA_CONFIG.timezone,
): boolean {
  const local = moment.tz(now, timezone);
  const minutes = local.hours() * 60 + local.minutes();
  const quietStart = EA_CONFIG.quietStartHour * 60;
  const quietEnd = EA_CONFIG.quietEndHour * 60 + EA_CONFIG.quietEndMinute;
  // The window wraps midnight: quiet when past 9pm or before 6:30am.
  return minutes >= quietStart || minutes < quietEnd;
}

// Start of the current EA day (PT midnight) - the boundary the daily ping cap
// counts against.
export function eaDayStart(
  now: Date,
  timezone: string = EA_CONFIG.timezone,
): Date {
  return moment.tz(now, timezone).startOf("day").toDate();
}
