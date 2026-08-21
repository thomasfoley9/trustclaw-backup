import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { findTask, type TaskView } from "./task-service";

// The one place the chase engine spends model tokens: preparing the
// deliverable a nudge ships with. Runs only when a nudge is actually due
// (never per tick), bounded by a wall-clock abort, and leaves its work in
// the flight recorder (the "Chief of staff" conversation).

const DRAFT_RUN_WALL_CLOCK_MS = 150_000;

export const EA_CONVERSATION_TITLE = "Chief of staff";

export async function runDraftForTask(
  instanceId: string,
  task: TaskView,
): Promise<TaskView | null> {
  const threadRef = task.sourceRef?.startsWith("event:")
    ? null
    : task.sourceRef;

  const prompt = [
    `<ea-internal-task>`,
    `Prepare the deliverable for ledger task ${task.taskId}: "${task.title}".`,
    threadRef
      ? `It references Gmail thread ${threadRef}. Read the thread, then create a concise draft (reply or bump, whichever the thread needs) with GMAIL_CREATE_EMAIL_DRAFT using thread_id "${threadRef}" and no subject so it stays in-thread.`
      : `Create the most useful artifact for this task (usually a Gmail draft or a short doc).`,
    `Write in the user's voice: concise, friendly, no em dashes, no filler.`,
    `Do NOT send anything. When the draft exists, call ea_task with action "attach_draft", taskId "${task.taskId}", and the draft id as draftRef.`,
    `Reply with one short line describing what you prepared.`,
    `</ea-internal-task>`,
  ].join("\n");

  const abort = new AbortController();
  const killTimer = setTimeout(() => abort.abort(), DRAFT_RUN_WALL_CLOCK_MS);
  let closeMcp: (() => Promise<void>) | null = null;

  try {
    const prepared = await prepareAgentRun({
      instanceId,
      userMessage: prompt,
      userMessageType: "hidden",
      source: "cron",
      dedicatedConversationTitle: EA_CONVERSATION_TITLE,
    });
    closeMcp = prepared.result.closeMcp;
    await prepared.result.agent.generate({
      prompt: prepared.result.messages,
      abortSignal: abort.signal,
    });
  } catch (err) {
    console.error(
      `[ea/draft] draft run failed for ${task.taskId}:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    clearTimeout(killTimer);
    await closeMcp?.().catch(() => undefined);
  }

  // Whatever happened, the ledger is the truth: re-read the task.
  return findTask(instanceId, task.taskId);
}
