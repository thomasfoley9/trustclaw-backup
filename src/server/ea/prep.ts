import {
  executeComposio,
  asArray,
  asRecord,
  asString,
} from "./composio-exec";
import { claimEvent } from "./events";
import { createTask } from "./task-service";
import { EA_CONFIG } from "./config";

// Pre-call lookahead, Phase 1 form: a deterministic calendar scan with a
// 2-hour horizon that opens a prep task per external meeting. Slice 2 wires
// the full brief pipeline into this seam. Fingerprinted per event id, so a
// meeting gets exactly one prep task no matter how many ticks see it.

export async function runPrepLookahead(
  instanceId: string,
  now: Date,
): Promise<void> {
  let result;
  try {
    result = await executeComposio(
      instanceId,
      "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
      {
        time_min: now.toISOString(),
        time_max: new Date(now.getTime() + EA_CONFIG.prepLookaheadMs).toISOString(),
        response_detail: "full",
        single_events: true,
      },
    );
  } catch (err) {
    console.error(
      "[ea/prep] calendar fetch error:",
      err instanceof Error ? err.message : err,
    );
    return;
  }
  if (!result.successful) {
    console.error("[ea/prep] calendar fetch failed:", result.error);
    return;
  }

  // Unified listing nests events either directly or as events[i].event.
  const rawEvents = asArray(result.data.events).map((e) => {
    const record = asRecord(e);
    return asRecord(record?.event) ?? record;
  });

  for (const event of rawEvents) {
    if (!event) continue;
    const eventId = asString(event.id);
    if (!eventId) continue;

    const attendees = asArray(event.attendees);
    // External meeting heuristic: 2+ attendees (you plus at least one other).
    // Solo blocks and reminders never need prep.
    if (attendees.length < 2) continue;

    const start = asRecord(event.start);
    const startAt = asString(start?.dateTime);
    if (!startAt) continue; // all-day events don't get call prep

    const summary = asString(event.summary) ?? "External meeting";

    const claimed = await claimEvent(instanceId, `prep:${eventId}`, "prep_task", {
      eventId,
      summary,
      startAt,
    });
    if (!claimed) continue;

    await createTask(instanceId, {
      title: `Prep: ${summary}`,
      source: "prep",
      priority: "high",
      dueAt: new Date(startAt),
      sourceRef: `event:${eventId}`,
    });
  }
}
