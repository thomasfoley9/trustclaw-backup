import { after, NextResponse } from "next/server";
import { env } from "~/env";
import { db } from "~/server/clients/db";
import {
  isTwilioConfigured,
  isValidTwilioSignature,
  sendSms,
} from "~/server/clients/twilio";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { parseAgentError } from "~/server/api/routers/trustclaw/agent/error-parser";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import { claimEvent } from "~/server/ea/events";
import { parseReply } from "~/server/ea/parser";
import {
  completeTask,
  snoozeTask,
  killTask,
  listTasks,
} from "~/server/ea/task-service";
import { formatAck, formatTaskList } from "~/server/ea/messages";
import { EA_CONVERSATION_TITLE } from "~/server/ea/draft-runner";

// Inbound SMS door. Mirrors the Telegram webhook's shape: verify, gate,
// dedup, ACK fast, run the agent in after(). Twilio-specific hardening:
//   - X-Twilio-Signature HMAC validation against the full webhook URL
//   - hard sender gate: ONLY the instance's verified number gets an agent;
//     anything else is dropped and logged (PRD: inbound SMS from anyone but
//     the owner is out of scope for v1)
//   - MessageSid dedup through EaEvent, same keystone as every other door

export const maxDuration = 300;

const AGENT_RUN_WALL_CLOCK_MS = 150_000;

export async function POST(request: Request) {
  if (!isTwilioConfigured()) {
    return new Response("SMS not configured", { status: 503 });
  }

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/twilio-webhook`;
  if (!isValidTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = params.From ?? "";
  const body = (params.Body ?? "").trim();
  const messageSid = params.MessageSid ?? "";
  if (!from || !body || !messageSid) {
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const instance = await db.composioClawInstance.findFirst({
    where: {
      eaPhoneNumber: from,
      eaPhoneVerifiedAt: { not: null },
      presenceEnabled: true,
      eaSmsEnabled: true,
    },
    select: { id: true },
  });
  if (!instance) {
    console.error(`[twilio] dropped inbound from unverified sender`, {
      fromSuffix: from.slice(-4),
    });
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const claimed = await claimEvent(instance.id, `sms:${messageSid}`, "sms_in", {
    sid: messageSid,
  });
  if (!claimed) {
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  after(
    handleSms(instance.id, from, body).catch(async (err: unknown) => {
      console.error(
        "[twilio] handleSms failed:",
        err instanceof Error ? err.message : err,
      );
      await sendSms(from, parseAgentError(err));
    }),
  );

  return new Response("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleSms(
  instanceId: string,
  from: string,
  text: string,
): Promise<void> {
  // The reply grammar works on every verified door. SMS answers stay terse.
  const parsed = parseReply(text, new Date());
  if (parsed) {
    switch (parsed.kind) {
      case "whats_due": {
        const tasks = await listTasks(instanceId, "due");
        await sendSms(from, formatTaskList(tasks, "due"));
        return;
      }
      case "done": {
        if (!parsed.taskRef) break;
        await sendSms(
          from,
          formatAck("done", await completeTask(instanceId, parsed.taskRef)),
        );
        return;
      }
      case "kill": {
        if (!parsed.taskRef) break;
        await sendSms(
          from,
          formatAck("kill", await killTask(instanceId, parsed.taskRef)),
        );
        return;
      }
      case "snooze": {
        if (!parsed.taskRef) break;
        await sendSms(
          from,
          formatAck(
            "snooze",
            await snoozeTask(instanceId, parsed.taskRef, parsed.until),
          ),
        );
        return;
      }
      default:
        // draft / send-ready involve Gmail round-trips; the agent path below
        // handles them conversationally on SMS.
        break;
    }
  }

  const abort = new AbortController();
  const killTimer = setTimeout(() => abort.abort(), AGENT_RUN_WALL_CLOCK_MS);
  let closeMcp: (() => Promise<void>) | null = null;
  let selectedModel: string | undefined;

  try {
    const prepared = await prepareAgentRun({
      instanceId,
      userMessage: text,
      source: "sms",
      dedicatedConversationTitle: EA_CONVERSATION_TITLE,
    });
    closeMcp = prepared.result.closeMcp;
    selectedModel = prepared.result.selectedModel;
    const result = await prepared.result.agent.generate({
      prompt: prepared.result.messages,
      abortSignal: abort.signal,
    });
    const reply = stripToolResultEchoes(result.text).trim();
    await sendSms(from, reply.slice(0, 1200) || "Done.");
  } catch (err) {
    await sendSms(from, parseAgentError(err, { model: selectedModel }));
  } finally {
    clearTimeout(killTimer);
    await closeMcp?.().catch(() => undefined);
  }
}
