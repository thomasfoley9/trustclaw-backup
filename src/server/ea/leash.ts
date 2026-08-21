import type { ToolSet } from "ai";
import { db } from "~/server/clients/db";
import { createTask } from "./task-service";
import { claimEvent } from "./events";

// The leash: draft-only outbound, enforced in code. Active only while
// Presence Mode is on (presence off keeps the app's legacy behavior for
// every other user of this codebase).
//
// The agent reaches external services through Composio's tool-router
// meta-tools (MULTI_EXECUTE, REMOTE_WORKBENCH, REMOTE_BASH), not per-slug
// tools, so the leash inspects the FULL argument payload of those calls for
// send-class slugs rather than wrapping individual tool names. String-scan
// over the serialized input is deliberately blunt: false positives cost one
// clarifying message, false negatives cost trust.
//
// Allowed without approval: everything read-only, Gmail DRAFT creation, and
// Slack posts whose every channel argument is the user's own #ea channel.
// Everything else send-class intercepts into an approval task.

const SEND_CLASS = [
  "GMAIL_SEND_EMAIL",
  "GMAIL_SEND_DRAFT",
  "GMAIL_REPLY_TO_THREAD",
  "SLACK_SEND_MESSAGE",
  "SLACK_SCHEDULE_MESSAGE",
  "GOOGLECALENDAR_CREATE_EVENT",
  "GOOGLECALENDAR_UPDATE_EVENT",
  "GOOGLECALENDAR_PATCH_EVENT",
  "GOOGLECALENDAR_DELETE_EVENT",
  "GOOGLECALENDAR_QUICK_ADD",
] as const;

// The meta-tools whose payloads can carry arbitrary slugs.
const META_TOOL_MARKERS = [
  "MULTI_EXECUTE_TOOL",
  "REMOTE_WORKBENCH",
  "REMOTE_BASH_TOOL",
];

const CHANNEL_ARG = /"channel"\s*:\s*"([^"]+)"/g;

export interface LeashContext {
  instanceId: string;
  enabled: boolean;
  eaSlackChannelId: string | null;
}

export function findSendClassSlugs(serializedInput: string): string[] {
  const upper = serializedInput.toUpperCase();
  return SEND_CLASS.filter((slug) => upper.includes(slug));
}

export function slackPostsConfinedToEa(
  serializedInput: string,
  eaChannelId: string | null,
): boolean {
  if (!eaChannelId) return false;
  const channels = [...serializedInput.matchAll(CHANNEL_ARG)].map((m) => m[1]);
  return channels.length > 0 && channels.every((c) => c === eaChannelId);
}

// Pure decision: should this payload be blocked, and why.
export function decideLeash(
  serializedInput: string,
  ctx: Pick<LeashContext, "eaSlackChannelId">,
): { blocked: false } | { blocked: true; slugs: string[] } {
  const slugs = findSendClassSlugs(serializedInput);
  if (slugs.length === 0) return { blocked: false };

  const onlySlack = slugs.every((s) => s.startsWith("SLACK_SEND"));
  if (onlySlack && slackPostsConfinedToEa(serializedInput, ctx.eaSlackChannelId)) {
    return { blocked: false };
  }
  return { blocked: true, slugs };
}

async function interceptToApproval(
  ctx: LeashContext,
  slugs: string[],
): Promise<Record<string, unknown>> {
  const label = slugs.join(", ");
  const title = `Approve: outbound send (${label})`;

  // One open approval task per action shape - a retrying agent must not
  // manufacture a pile of identical approvals.
  const existing = await db.eaTask.findFirst({
    where: {
      instanceId: ctx.instanceId,
      source: "approval",
      title,
      status: { in: ["open", "waiting"] },
    },
    select: { shortId: true },
  });

  const taskId = existing
    ? `T-${existing.shortId}`
    : (
        await createTask(ctx.instanceId, {
          title,
          source: "approval",
          priority: "high",
        })
      ).taskId;

  await claimEvent(
    ctx.instanceId,
    `block:${crypto.randomUUID()}`,
    "blocked_action",
    { slugs, taskId },
  );

  return {
    blocked: true,
    reason: `Outbound sends need per-message approval while Presence Mode is on (blocked: ${label}).`,
    approvalTaskId: taskId,
    instruction:
      "Do NOT retry the send. Create a Gmail draft of the message instead (GMAIL_CREATE_EMAIL_DRAFT is allowed), attach it to the approval task with ea_task attach_draft, and tell the user the draft is ready for send-ready approval.",
  };
}

export function applyEaLeash(tools: ToolSet, ctx: LeashContext): ToolSet {
  if (!ctx.enabled) return tools;

  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const upperName = name.toUpperCase();
    const isMetaTool = META_TOOL_MARKERS.some((m) => upperName.includes(m));
    const isDirectSendTool = findSendClassSlugs(upperName).length > 0;

    if ((!isMetaTool && !isDirectSendTool) || !tool.execute) {
      wrapped[name] = tool;
      continue;
    }

    const originalExecute = tool.execute;
    wrapped[name] = {
      ...tool,
      execute: async (...args: Parameters<typeof originalExecute>) => {
        let serialized = "";
        try {
          serialized = JSON.stringify(args[0] ?? {});
        } catch {
          serialized = "";
        }
        const probe = isDirectSendTool ? `${upperName} ${serialized}` : serialized;
        const decision = decideLeash(probe, ctx);
        if (decision.blocked) {
          return interceptToApproval(ctx, decision.slugs);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- pass-through preserves the wrapped tool's own result shape
        return originalExecute(...args);
      },
    };
  }
  return wrapped;
}
