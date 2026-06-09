import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet, SystemModelMessage } from "ai";
import { db } from "~/server/clients/db";
import { createComposioClient } from "~/server/clients/composio";
import { buildSystemPrompt } from "./system-prompt";
import {
  createCustomTools,
  searchMemoriesForContext,
  getBucketMemories,
} from "./tools";
import { ALWAYS_INJECT_BUCKETS } from "../memory-buckets";
import { getContextWindow } from "./context/context-window";
import { pruneContext } from "./context/context-pruning";
import {
  loadContextMessages,
  buildContext,
  toPlainRecordSafe,
  toPrismaJson,
  runPostResponseTasks,
  sanitizeString,
  deepSanitize,
} from "./context/build-context";
import {
  DEFAULT_COMPACTION_SETTINGS,
  type CompactionSettings,
} from "./context/token-estimation";
import { stripToolResultEchoes } from "./strip-tool-echoes";
import { clearStreamingMessage } from "~/server/clients/redis";
import type { ReconstructedMessage } from "./types";

type MessageSource = "web" | "telegram" | "cron";

/**
 * Wraps every tool's execute function to sanitize its return value,
 * replacing lone Unicode surrogates with U+FFFD. Composio tool results
 * (e.g. scraped web pages, email bodies) can contain malformed Unicode
 * that produces invalid JSON when the AI SDK serializes the request
 * body for the Anthropic API.
 */
function sanitizeToolResults(tools: ToolSet): ToolSet {
  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (tool.execute) {
      const originalExecute = tool.execute;
      wrapped[name] = {
        ...tool,
        execute: async (...args: Parameters<typeof originalExecute>) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- tool execute returns unknown/any; deepSanitize preserves the shape
          const result = await originalExecute(...args);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return deepSanitize(result);
        },
      };
    } else {
      wrapped[name] = tool;
    }
  }
  return wrapped;
}

interface PrepareAgentRunParams {
  instanceId: string;
  userMessage: string;
  source: MessageSource;
  userMessageType?: "hidden";
}

interface PrepareAgentRunResult {
  agent: ToolLoopAgent;
  messages: ReconstructedMessage[];
}

type PrepareResult = { status: "ready"; result: PrepareAgentRunResult };

export async function prepareAgentRun(
  params: PrepareAgentRunParams,
): Promise<PrepareResult> {
  const { instanceId, userMessage, source, userMessageType } = params;

  const instance = await db.composioClawInstance.findUnique({
    where: { id: instanceId },
  });

  if (!instance) {
    throw new Error("Instance not found");
  }

  const user = await db.user.findUnique({
    where: { id: instance.userId },
    select: { timezone: true },
  });

  const userTimezone = user?.timezone ?? "UTC";

  const incognito = instance.incognitoMode;
  const activeBucket = instance.activeMemoryBucket;

  // Resolve the active chat session (lazily create one if none is set). All
  // entry points append to this conversation; each has its own context window.
  const conversationSelect = {
    id: true,
    title: true,
    compactionCount: true,
    memoryFlushCount: true,
    lastCompactionSummary: true,
    lastCompactionAt: true,
  } as const;
  let conversation = instance.activeConversationId
    ? await db.conversation.findFirst({
        where: { id: instance.activeConversationId, instanceId },
        select: conversationSelect,
      })
    : null;
  if (!conversation) {
    conversation = await db.conversation.create({
      data: { instanceId, title: "New chat" },
      select: conversationSelect,
    });
    await db.composioClawInstance.update({
      where: { id: instanceId },
      data: { activeConversationId: conversation.id },
    });
  }
  const conversationId = conversation.id;

  // Active personality overrides the instance soul prompt when set.
  const activePersonality = instance.activePersonalityId
    ? await db.personality.findUnique({
        where: { id: instance.activePersonalityId },
        select: { name: true, prompt: true, instanceId: true },
      })
    : null;
  const personaApplies = activePersonality?.instanceId === instanceId;
  const effectiveSoulPrompt =
    personaApplies && activePersonality
      ? activePersonality.prompt
      : instance.soulPrompt;
  const activePersonalityName =
    personaApplies && activePersonality ? activePersonality.name : null;

  // When a persona is active it owns the voice. The onboarding-generated
  // identity prompt hard-codes "**Personality:**" / "**Writing Style:**" lines
  // that contradict it - strip those so the active persona isn't overridden by
  // a stale label the model would otherwise anchor on. (Format is produced by
  // assembleIdentityPrompt, so these line patterns are stable.)
  const effectiveIdentityPrompt =
    personaApplies && instance.identityPrompt
      ? instance.identityPrompt
          .replace(/^\*\*Personality:\*\*.*$/gm, "")
          .replace(/^\*\*Writing Style:\*\*.*$/gm, "")
      : instance.identityPrompt;

  // Incognito chats start fresh: no memory recall, no prior history.
  const relevantMemories = incognito
    ? []
    : await searchMemoriesForContext(instanceId, userMessage, activeBucket);

  // Always-inject buckets (curated product knowledge) are loaded every turn,
  // regardless of similarity or the active bucket. Skipped in incognito.
  const productKnowledge = incognito
    ? []
    : (
        await Promise.all(
          ALWAYS_INJECT_BUCKETS.map((bucket) =>
            getBucketMemories(instanceId, bucket),
          ),
        )
      ).flat();

  const systemPrompt = sanitizeString(
    buildSystemPrompt({
      soulPrompt: effectiveSoulPrompt,
      identityPrompt: effectiveIdentityPrompt,
      userPrompt: instance.userPrompt,
      activePersonalityName,
      relevantMemories,
      productKnowledge,
      hasCompactionSummary: !!conversation.lastCompactionSummary,
      userTimezone,
    }),
  );

  const dbMessages = incognito
    ? []
    : await loadContextMessages(conversationId, conversation.lastCompactionAt);
  const aiMessages = buildContext(
    dbMessages,
    incognito ? null : conversation.lastCompactionSummary,
    userMessage,
  );

  const contextWindow = getContextWindow(instance.anthropicModel);
  const { messages: prunedMessages } = pruneContext(aiMessages, contextWindow);

  // Add cache breakpoint to last history message (before new user message)
  // so the conversation prefix is cached across turns
  if (prunedMessages.length >= 2) {
    const lastHistoryIndex = prunedMessages.length - 2;
    const msg = prunedMessages[lastHistoryIndex]!;
    prunedMessages[lastHistoryIndex] = {
      ...msg,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    };
  }

  // Incognito messages are stored as `hidden` so they never re-enter
  // context loading or chat history on subsequent turns.
  const effectiveMessageType = incognito ? "hidden" : userMessageType;

  await db.message.create({
    data: {
      instanceId,
      conversationId,
      role: "user",
      content: [{ type: "text", text: userMessage }],
      source,
      ...(effectiveMessageType && { messageType: effectiveMessageType }),
    },
  });

  // Auto-title the session from its first visible user message, and keep it
  // sorted by recency. Skipped for incognito/hidden trigger messages.
  if (!incognito && !effectiveMessageType) {
    const isFirstTitle = conversation.title === "New chat";
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        ...(isFirstTitle && {
          title: userMessage.trim().slice(0, 60) || "New chat",
        }),
      },
    });
  }

  const composio = createComposioClient();
  const session = await composio.create(instance.userId, {
    manageConnections: {
      waitForConnections: true,
    },
  });
  const composioTools = await session.tools();

  const customTools = createCustomTools(instanceId, userTimezone, {
    activeBucket,
    incognito,
  });

  const allTools: ToolSet = sanitizeToolResults({
    ...composioTools,
    ...customTools,
  });

  // Pre-create assistant message row so we can update it in onFinish
  const assistantMessageRow = await db.message.create({
    data: {
      instanceId,
      conversationId,
      role: "assistant",
      content: toPrismaJson([]),
      source,
      ...(incognito && { messageType: "hidden" as const }),
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  });

  const modelString = instance.anthropicModel.startsWith("anthropic/")
    ? instance.anthropicModel
    : `anthropic/${instance.anthropicModel}`;
  const model = modelString;

  const agent = new ToolLoopAgent({
    model,
    instructions: {
      role: "system",
      content: systemPrompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    } satisfies SystemModelMessage,
    tools: allTools,
    stopWhen: stepCountIs(100),
    onFinish: async (result) => {
      try {
        const { totalUsage, steps } = result;
        const inputTokens = totalUsage.inputTokens ?? 0;
        const outputTokens = totalUsage.outputTokens ?? 0;
        const cacheReadTokens =
          totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
        const cacheWriteTokens =
          totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0;

        // Build assistant content from steps (UIMessage parts format)
        const assistantParts: Array<Record<string, unknown>> = [];

        for (const step of steps) {
          for (let i = 0; i < step.toolCalls.length; i++) {
            const tc = step.toolCalls[i]!;
            const tr = step.toolResults[i];
            const tcInput = toPlainRecordSafe(tc.input);
            const tcResult = tr ? toPlainRecordSafe(tr.output) : null;

            assistantParts.push({
              type: "dynamic-tool" as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              state: tcResult ? "output-available" : "input-available",
              input: tcInput,
              output: tcResult ?? {},
            });
          }

          const stepText = stripToolResultEchoes(step.text);
          if (stepText) {
            assistantParts.push({ type: "text" as const, text: stepText });
          }
        }

        // Update the pre-created assistant message with final content + totals
        await db.message.update({
          where: { id: assistantMessageRow.id },
          data: {
            content: toPrismaJson(assistantParts),
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
          },
        });

        // Fire-and-forget post-response tasks
        const totalContextTokens = inputTokens + outputTokens;
        const settings: CompactionSettings = {
          contextWindow,
          ...DEFAULT_COMPACTION_SETTINGS,
        };

        // Incognito turns never flush memory or compact - nothing persists.
        if (incognito) {
          return;
        }

        void runPostResponseTasks({
          instanceId,
          conversationId,
          conversation: {
            anthropicModel: instance.anthropicModel,
            compactionCount: conversation.compactionCount,
            memoryFlushCount: conversation.memoryFlushCount,
            lastCompactionSummary: conversation.lastCompactionSummary,
            lastCompactionAt: conversation.lastCompactionAt,
          },
          contextTokens: totalContextTokens,
          settings,
          prunedMessages,
        });
      } catch (error) {
        console.error("[agent/onFinish] post-stream processing failed:", error);
      } finally {
        await clearStreamingMessage(instanceId).catch((error) =>
          console.error(
            "[agent/onFinish] clearStreamingMessage failed:",
            error,
          ),
        );
      }
    },
  });

  return {
    status: "ready",
    result: {
      agent,
      messages: prunedMessages,
    },
  };
}

export type {
  PrepareAgentRunParams,
  PrepareResult,
  PrepareAgentRunResult,
  MessageSource,
};
