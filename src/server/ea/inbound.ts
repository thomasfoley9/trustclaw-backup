import { db } from "~/server/clients/db";
import {
  fetchEaMessagesSince,
  postToEaChannel,
  slackOutFingerprint,
  EA_PREFIX,
} from "~/server/clients/slack";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import { parseAgentError } from "~/server/api/routers/trustclaw/agent/error-parser";
import { executeComposio, asRecord, asString } from "./composio-exec";
import { claimEvent, wasSeen } from "./events";
import { parseReply, type ParsedReply } from "./parser";
import {
  completeTask,
  snoozeTask,
  killTask,
  listTasks,
  findTask,
} from "./task-service";
import { formatAck, formatTaskList } from "./messages";
import { runDraftForTask, EA_CONVERSATION_TITLE } from "./draft-runner";
import { EA_CONFIG } from "./config";

// Inbound #ea reader (the Phase 1 polling path; the slice 2 Slack trigger
// retires it). Identity is structural, not cosmetic: a message is the EA's
// own iff its ts is in the sent-message ledger (with the visible prefix as a
// belt-and-suspenders check), everything else in this channel is the user.
// The cursor advances per processed message, transactionally with that
// message's dedup row, so a crashed tick reprocesses nothing and skips
// nothing.

const AGENT_RUN_WALL_CLOCK_MS = 150_000;
const MAX_AGENT_RUNS_PER_TICK = 2;

interface InboundInstance {
  id: string;
  eaSlackChannelId: string;
  eaSlackCursorTs: string | null;
}

export async function processEaInbound(
  instance: InboundInstance,
  now: Date,
): Promise<void> {
  const messages = await fetchEaMessagesSince(
    instance.id,
    instance.eaSlackChannelId,
    instance.eaSlackCursorTs,
  );

  let agentRuns = 0;
  let processed = 0;

  for (const msg of messages) {
    if (processed >= EA_CONFIG.maxInboundMessagesPerTick) break;

    const fingerprint = `slack_in:${instance.eaSlackChannelId}:${msg.ts}`;

    // Loop guard first: our own posts advance the cursor and nothing else.
    const isOwn =
      msg.text.startsWith(EA_PREFIX) ||
      (await wasSeen(
        instance.id,
        slackOutFingerprint(instance.eaSlackChannelId, msg.ts),
      ));

    if (isOwn) {
      await advanceCursor(instance.id, msg.ts);
      continue;
    }

    const claimed = await claimEvent(instance.id, fingerprint, "slack_in", {
      ts: msg.ts,
    });
    if (!claimed) {
      await advanceCursor(instance.id, msg.ts);
      continue;
    }

    const parsed = parseReply(msg.text, now);
    if (parsed) {
      await handleCommand(instance.id, parsed, msg.ts);
    } else {
      if (agentRuns >= MAX_AGENT_RUNS_PER_TICK) {
        // Out of agent budget this tick: leave the cursor BEFORE this message
        // so the next tick picks it up. Release the claim so the retry works.
        await db.eaEvent.deleteMany({
          where: { instanceId: instance.id, fingerprint },
        });
        break;
      }
      agentRuns += 1;
      await handleNaturalLanguage(instance.id, msg.text, msg.ts);
    }

    await advanceCursor(instance.id, msg.ts);
    processed += 1;
  }
}

async function advanceCursor(instanceId: string, ts: string): Promise<void> {
  await db.composioClawInstance.update({
    where: { id: instanceId },
    data: { eaSlackCursorTs: ts },
  });
}

async function handleCommand(
  instanceId: string,
  parsed: ParsedReply,
  threadTs: string,
): Promise<void> {
  const reply = (text: string) =>
    postToEaChannel(instanceId, text, { threadTs });

  switch (parsed.kind) {
    case "whats_due": {
      const tasks = await listTasks(instanceId, "due");
      await reply(formatTaskList(tasks, "due"));
      return;
    }
    case "done": {
      if (!parsed.taskRef) return void (await reply("Which task? Say the ID, like: done T-14."));
      const task = await completeTask(instanceId, parsed.taskRef);
      await reply(formatAck("done", task));
      return;
    }
    case "kill": {
      if (!parsed.taskRef) return void (await reply("Which task? Say the ID, like: kill T-14."));
      const task = await killTask(instanceId, parsed.taskRef);
      await reply(formatAck("kill", task));
      return;
    }
    case "snooze": {
      if (!parsed.taskRef) return void (await reply("Which task? Say the ID, like: snooze T-14 til friday."));
      const task = await snoozeTask(instanceId, parsed.taskRef, parsed.until);
      await reply(formatAck("snooze", task));
      return;
    }
    case "draft": {
      if (!parsed.taskRef) return void (await reply("Which task? Say the ID, like: draft it T-14."));
      const task = await findTask(instanceId, parsed.taskRef);
      if (!task) return void (await reply(formatAck("draft", null)));
      await reply(`On it. Drafting for ${task.taskId}.`);
      const updated = await runDraftForTask(instanceId, task);
      await reply(
        updated?.draftRef
          ? `${task.taskId} draft is ready in Gmail. Reply "send-ready ${task.taskId}" to send it.`
          : `Couldn't finish the draft for ${task.taskId}. I'll retry on the next pass, or tell me more about what it should say.`,
      );
      return;
    }
    case "send_ready": {
      if (!parsed.taskRef) return void (await reply("Which task? Say the ID, like: send-ready T-14."));
      await handleSendReady(instanceId, parsed.taskRef, threadTs);
      return;
    }
  }
}

// send-ready: sends the referenced Gmail draft verbatim, one message per
// approval, with the stale-draft guard from PRD section 6. Staleness check:
// the watched thread has activity newer than the task's last update (the
// counterparty spoke after the draft was prepared).
async function handleSendReady(
  instanceId: string,
  taskRef: string,
  threadTs: string,
): Promise<void> {
  const reply = (text: string) =>
    postToEaChannel(instanceId, text, { threadTs });

  const task = await findTask(instanceId, taskRef);
  if (!task) return void (await reply(formatAck("send", null)));
  if (!task.draftRef) {
    return void (await reply(
      `${task.taskId} has no draft attached yet. Say "draft it ${task.taskId}" first.`,
    ));
  }

  if (task.sourceRef) {
    const watch = await db.eaWatch.findUnique({
      where: {
        instanceId_kind_ref: {
          instanceId,
          kind: "thread",
          ref: task.sourceRef,
        },
      },
      select: { lastActivityAt: true },
    });
    if (
      watch &&
      watch.lastActivityAt.getTime() > new Date(task.updatedAt).getTime()
    ) {
      return void (await reply(
        `Hold on: they replied after this draft was written, so it may be stale. Say "draft it ${task.taskId}" and I'll refresh it against the latest message.`,
      ));
    }
  }

  const sent = await executeComposio(instanceId, "GMAIL_SEND_DRAFT", {
    draft_id: task.draftRef,
  });
  if (!sent.successful) {
    return void (await reply(
      `Send failed for ${task.taskId}: ${sent.error ?? "Gmail error"}. The draft is still in your drafts folder.`,
    ));
  }
  const messageId =
    asString(sent.data.id) ?? asString(asRecord(sent.data.message)?.id);
  await completeTask(instanceId, task.taskId);
  await reply(
    `Sent. ${task.taskId} is done.${messageId ? ` (message ${messageId})` : ""}`,
  );
}

// Anything the grammar doesn't cover goes to the full agent as natural
// language, in the EA's own conversation, with the reply threaded back.
async function handleNaturalLanguage(
  instanceId: string,
  text: string,
  threadTs: string,
): Promise<void> {
  const abort = new AbortController();
  const killTimer = setTimeout(() => abort.abort(), AGENT_RUN_WALL_CLOCK_MS);
  let closeMcp: (() => Promise<void>) | null = null;

  try {
    const prepared = await prepareAgentRun({
      instanceId,
      userMessage: text,
      source: "slack",
      dedicatedConversationTitle: EA_CONVERSATION_TITLE,
    });
    closeMcp = prepared.result.closeMcp;
    const result = await prepared.result.agent.generate({
      prompt: prepared.result.messages,
      abortSignal: abort.signal,
    });
    const replyText = stripToolResultEchoes(result.text).trim();
    await postToEaChannel(
      instanceId,
      replyText || "Done. (No details to report.)",
      { threadTs },
    );
  } catch (err) {
    console.error(
      "[ea/inbound] agent run failed:",
      err instanceof Error ? err.message : err,
    );
    await postToEaChannel(instanceId, parseAgentError(err), { threadTs });
  } finally {
    clearTimeout(killTimer);
    await closeMcp?.().catch(() => undefined);
  }
}
