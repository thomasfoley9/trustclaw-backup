import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet, SystemModelMessage } from "ai";
import { db } from "~/server/clients/db";
import { getComposioForInstance } from "~/server/clients/composio";
import { loadMcpTools } from "~/server/clients/mcp";
import { resolveAgentModel, isHouseModel } from "./resolve-model";
import { buildSystemPrompt } from "./system-prompt";
import { narrateWithAgentA, buildToolStepsDigest } from "./narrate";
import {
  createCustomTools,
  searchMemoriesForContext,
  getBucketMemories,
} from "./tools";
import { getAlwaysInjectBucketSlugs } from "../bucket-service";
import { getEnabledSkills } from "../skill-service";
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
  // Pins the run to a specific session (validated against the instance). The
  // web client sends this so a sidebar switch in another tab can't reroute an
  // in-flight message to the wrong conversation.
  conversationId?: string;
  // Routes the run into a dedicated named session (find-or-create) instead of
  // the user's active one - used by cron ("Scheduled tasks") and Telegram so
  // automated runs never pollute the chat the user currently has open.
  dedicatedConversationTitle?: string;
  // Files attached to this turn. Images/PDFs become native model parts;
  // text-like files (csv/txt/json/md) are inlined as text.
  attachments?: Array<{ name: string; mediaType: string; data: string }>;
}

interface PrepareAgentRunResult {
  agent: ToolLoopAgent;
  messages: ReconstructedMessage[];
  // The session this run resolved to (pinned, dedicated, or active).
  conversationId: string;
  // Resolves to Agent A's narration (the concise chat bubble) once B finishes.
  // The route injects it into the live stream; onFinish also persists it.
  narrationPromise: Promise<string>;
}

type PrepareResult = { status: "ready"; result: PrepareAgentRunResult };

export async function prepareAgentRun(
  params: PrepareAgentRunParams,
): Promise<PrepareResult> {
  const {
    instanceId,
    userMessage,
    source,
    userMessageType,
    conversationId: pinnedConversationId,
    dedicatedConversationTitle,
    attachments = [],
  } = params;

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

  // Resolve which session this run writes to, in priority order:
  //   1. explicit pin from the caller (web client pins what it's viewing)
  //   2. dedicated named session (cron/telegram - never touches the active one)
  //   3. the instance's active session, lazily created if missing
  const conversationSelect = {
    id: true,
    title: true,
    lastPersonalityId: true,
    compactionCount: true,
    memoryFlushCount: true,
    lastCompactionSummary: true,
    lastCompactionAt: true,
  } as const;

  let conversation = pinnedConversationId
    ? await db.conversation.findFirst({
        where: { id: pinnedConversationId, instanceId },
        select: conversationSelect,
      })
    : null;

  if (!conversation && dedicatedConversationTitle) {
    conversation =
      (await db.conversation.findFirst({
        where: { instanceId, title: dedicatedConversationTitle },
        select: conversationSelect,
        orderBy: { createdAt: "asc" },
      })) ??
      (await db.conversation.create({
        data: { instanceId, title: dedicatedConversationTitle },
        select: conversationSelect,
      }));
  }

  if (!conversation && instance.activeConversationId) {
    conversation = await db.conversation.findFirst({
      where: { id: instance.activeConversationId, instanceId },
      select: conversationSelect,
    });
  }
  if (!conversation) {
    // Lazy create, race-safe: claim the active pointer only if it's still
    // unset; the loser of a concurrent race re-reads the winner's conversation
    // and deletes its own orphan.
    const created = await db.conversation.create({
      data: { instanceId, title: "New chat" },
      select: conversationSelect,
    });
    const claimed = await db.composioClawInstance.updateMany({
      where: { id: instanceId, activeConversationId: null },
      data: { activeConversationId: created.id },
    });
    if (claimed.count === 0) {
      const fresh = await db.composioClawInstance.findUnique({
        where: { id: instanceId },
        select: { activeConversationId: true },
      });
      const winner = fresh?.activeConversationId
        ? await db.conversation.findFirst({
            where: { id: fresh.activeConversationId, instanceId },
            select: conversationSelect,
          })
        : null;
      if (winner) {
        await db.conversation
          .delete({ where: { id: created.id } })
          .catch(() => undefined);
        conversation = winner;
      } else {
        conversation = created;
      }
    } else {
      conversation = created;
    }
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
  const currentPersonalityId =
    personaApplies && activePersonality ? instance.activePersonalityId : null;

  // Detect a mid-conversation personality switch. When it changes, the prior
  // assistant turns in this session anchor the model to the old tone; a
  // recency-positioned note on the new user turn forces the new voice. Only
  // for visible user turns - cron/incognito triggers don't need tone notes.
  const personaSwitched =
    !incognito &&
    !userMessageType &&
    !!conversation.lastPersonalityId &&
    conversation.lastPersonalityId !== currentPersonalityId;

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
          (await getAlwaysInjectBucketSlugs(instanceId)).map((bucket) =>
            getBucketMemories(instanceId, bucket),
          ),
        )
      ).flat();

  // Enabled skills inject into the system prompt as named capabilities.
  const skills = incognito ? [] : await getEnabledSkills(instanceId);

  const systemPrompt = sanitizeString(
    buildSystemPrompt({
      soulPrompt: effectiveSoulPrompt,
      identityPrompt: effectiveIdentityPrompt,
      userPrompt: instance.userPrompt,
      activePersonalityName,
      relevantMemories,
      productKnowledge,
      skills,
      hasCompactionSummary: !!conversation.lastCompactionSummary,
      userTimezone,
      uncensored: isHouseModel(instance.anthropicModel),
    }),
  );

  // The model sees a switch note when the persona just changed; the persisted
  // user message (below) stays the raw text.
  let modelUserMessage =
    personaSwitched && activePersonalityName
      ? `[Your active personality was just switched to "${activePersonalityName}". Starting with this reply, fully adopt the ${activePersonalityName} voice and drop the previous tone entirely.]\n\n${userMessage}`
      : userMessage;

  // Build attachment parts. Images/PDFs are native model parts (Claude reads
  // them directly); text-like files are inlined into the message text. The
  // persisted message stores lightweight markers only (no bytes), so DB and
  // future context stay lean - attachments inform the turn they're sent on.
  type ImagePart = { type: "image"; image: Uint8Array; mediaType: string };
  type FilePart = {
    type: "file";
    data: Uint8Array;
    mediaType: string;
    filename: string;
  };
  const mediaParts: Array<ImagePart | FilePart> = [];
  const attachmentMarkers: Array<{
    type: "file-attachment";
    name: string;
    mediaType: string;
  }> = [];
  const TEXT_FILE_RE = /\.(csv|tsv|txt|md|markdown|json|ya?ml|xml|log)$/i;
  const isTextual = (a: { name: string; mediaType: string }) =>
    a.mediaType.startsWith("text/") ||
    ["application/json", "application/xml", "application/csv"].includes(
      a.mediaType,
    ) ||
    TEXT_FILE_RE.test(a.name);

  for (const att of attachments) {
    attachmentMarkers.push({
      type: "file-attachment",
      name: att.name,
      mediaType: att.mediaType,
    });
    const bytes = Buffer.from(att.data, "base64");
    if (att.mediaType.startsWith("image/")) {
      mediaParts.push({
        type: "image",
        image: new Uint8Array(bytes),
        mediaType: att.mediaType,
      });
    } else if (att.mediaType === "application/pdf") {
      mediaParts.push({
        type: "file",
        data: new Uint8Array(bytes),
        mediaType: "application/pdf",
        filename: att.name,
      });
    } else if (isTextual(att)) {
      const text = bytes.toString("utf8").slice(0, 200_000);
      modelUserMessage += `\n\n--- Attached file: ${att.name} ---\n${text}`;
    } else {
      modelUserMessage += `\n\n[Attached file "${att.name}" (${att.mediaType}) — unsupported format; ask the user to share it as PDF, CSV, or text if you need its contents.]`;
    }
  }

  const userContent =
    mediaParts.length > 0
      ? [{ type: "text" as const, text: modelUserMessage }, ...mediaParts]
      : modelUserMessage;
  // Used to scrub the note from post-response tasks (memory flush) so the
  // switch instruction can never be saved as a durable "memory".
  const personaSwitchNoteRe =
    /^\[Your active personality was just switched[^\]]*\]\n\n/;

  const dbMessages = incognito
    ? []
    : await loadContextMessages(conversationId, conversation.lastCompactionAt);
  const aiMessages = buildContext(
    dbMessages,
    incognito ? null : conversation.lastCompactionSummary,
    userContent,
  );

  const contextWindow = getContextWindow(instance.anthropicModel);
  const { messages: prunedMessages } = pruneContext(aiMessages, contextWindow);

  // Anthropic prompt-caching options are meaningless to OpenAI-compatible house
  // models — only attach them for Anthropic-backed models.
  const isHouse = isHouseModel(instance.anthropicModel);

  // Add cache breakpoint to last history message (before new user message)
  // so the conversation prefix is cached across turns
  if (!isHouse && prunedMessages.length >= 2) {
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
      content: [
        { type: "text", text: userMessage },
        ...attachmentMarkers,
      ],
      source,
      ...(effectiveMessageType && { messageType: effectiveMessageType }),
    },
  });

  // Track the persona used on every non-incognito turn (hidden cron triggers
  // included, so a stale value can't re-trigger switch notes later). Title
  // and recency only update for visible user messages.
  if (!incognito) {
    const isVisible = !effectiveMessageType;
    const isFirstTitle = conversation.title === "New chat";
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastPersonalityId: currentPersonalityId,
        ...(isVisible && { lastMessageAt: new Date() }),
        ...(isVisible &&
          isFirstTitle && {
            title: userMessage.trim().slice(0, 60) || "New chat",
          }),
      },
    });
  }

  const { client: composio, composioUserId } =
    await getComposioForInstance(instanceId);
  const session = await composio.create(composioUserId, {
    manageConnections: {
      waitForConnections: true,
    },
  });
  const composioTools = await session.tools();

  const customTools = createCustomTools(instanceId, userTimezone, {
    activeBucket,
    incognito,
  });

  // Tools from the user's MCP servers (Composio MCP URLs, etc.). Clients stay
  // open for the run and are closed in onFinish; per-server failures are
  // isolated and never block the run.
  const mcp = await loadMcpTools(instanceId);

  const allTools: ToolSet = sanitizeToolResults({
    ...composioTools,
    ...customTools,
    ...mcp.tools,
  });

  // Resolve the model first (per-user Anthropic key). Fails closed with a
  // PRECONDITION_FAILED before we create the assistant row if no key is set.
  const model = await resolveAgentModel(instanceId, instance.anthropicModel);

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

  // Agent A narration: onFinish computes it once (and persists it); the route
  // awaits this to inject A's concise reply into the live stream. Defaults to
  // B's text on any failure so the chat is never empty.
  let resolveNarration!: (text: string) => void;
  const narrationPromise = new Promise<string>((resolve) => {
    resolveNarration = resolve;
  });

  const agent = new ToolLoopAgent({
    model,
    instructions: {
      role: "system",
      content: systemPrompt,
      ...(isHouse
        ? {}
        : {
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          }),
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

        // Build B's tool parts (the cockpit's source of truth) + collect B's
        // full text. Agent A then narrates B's text into the concise chat reply;
        // the persisted message is [B's tool parts] + [A's narration text].
        const assistantParts: Array<Record<string, unknown>> = [];
        const toolNames: string[] = [];
        let executorText = "";

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
            toolNames.push(tc.toolName);
          }

          const stepText = stripToolResultEchoes(step.text);
          if (stepText) {
            executorText += (executorText ? "\n\n" : "") + stepText;
          }
        }

        // Agent A: turn B's raw output into the concise conversational reply.
        // Resolve the narration promise first (the live stream is waiting on it),
        // then append A's text as the chat bubble's text part.
        const narration = await narrateWithAgentA({
          instanceId,
          // Agent A runs on its own model if the user set one, else Agent B's.
          modelId: instance.agentAModel ?? instance.anthropicModel,
          executorText,
          toolStepsDigest: buildToolStepsDigest(toolNames),
          personaName: activePersonalityName,
        });
        resolveNarration(narration);
        if (narration.trim()) {
          assistantParts.push({ type: "text" as const, text: narration });
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

        const flushSafeMessages = prunedMessages.map((m) =>
          m.role === "user" && typeof m.content === "string"
            ? { ...m, content: m.content.replace(personaSwitchNoteRe, "") }
            : m,
        );

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
          prunedMessages: flushSafeMessages,
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
        await mcp.close().catch((error) =>
          console.error("[agent/onFinish] mcp close failed:", error),
        );
      }
    },
  });

  return {
    status: "ready",
    result: {
      agent,
      messages: prunedMessages,
      conversationId,
      narrationPromise,
    },
  };
}

export type {
  PrepareAgentRunParams,
  PrepareResult,
  PrepareAgentRunResult,
  MessageSource,
};
