import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet, SystemModelMessage } from "ai";
import { db } from "~/server/clients/db";
import { getComposioForInstance } from "~/server/clients/composio";
import { loadMcpTools } from "~/server/clients/mcp";
import { resolveAgentModel, isHouseModel } from "./resolve-model";
import { buildSystemPrompt } from "./system-prompt";
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
  // Tears down the run's MCP clients. onFinish closes them on a normal finish,
  // but aborted runs (Stop) and zero-step provider errors never reach onFinish
  // — callers MUST also invoke this from their own cleanup (it's idempotent).
  closeMcp: () => Promise<void>;
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
        // Best-effort orphan cleanup — never fail the run over it, but log so a
        // persistent failure (DB trouble) is visible rather than silent.
        await db.conversation
          .delete({ where: { id: created.id } })
          .catch((err) => {
            console.error(
              "[setup] orphan conversation cleanup failed",
              err instanceof Error ? err.message : err,
            );
          });
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

  // Memory recall, always-inject product knowledge, and enabled skills are
  // independent reads that all feed buildSystemPrompt() — fetch them
  // concurrently instead of serially. Incognito chats skip all recall.
  const [relevantMemories, productKnowledge, skills] = await Promise.all([
    incognito
      ? Promise.resolve<string[]>([])
      : searchMemoriesForContext(instanceId, userMessage, activeBucket),
    incognito
      ? Promise.resolve<string[]>([])
      : getAlwaysInjectBucketSlugs(instanceId).then((buckets) =>
          Promise.all(
            buckets.map((bucket) => getBucketMemories(instanceId, bucket)),
          ).then((lists) => lists.flat()),
        ),
    incognito ? Promise.resolve([]) : getEnabledSkills(instanceId),
  ]);

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

  // The Composio session (key load → connection setup → tool fetch) and the
  // user's MCP servers load independently, so run them concurrently — this is
  // ~300-600ms of wall-clock off every turn. MCP per-server failures are
  // isolated and never block the run; clients stay open for the run and are
  // closed in onFinish.
  const [composioTools, mcp] = await Promise.all([
    (async () => {
      const { client: composio, composioUserId } =
        await getComposioForInstance(instanceId);
      const session = await composio.create(composioUserId, {
        manageConnections: {
          waitForConnections: true,
        },
      });
      return session.tools();
    })(),
    loadMcpTools(instanceId),
  ]);

  const customTools = createCustomTools(instanceId, userTimezone, {
    activeBucket,
    incognito,
  });

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
      let executorText = "";
      try {
        const { totalUsage, steps } = result;
        const inputTokens = totalUsage.inputTokens ?? 0;
        const outputTokens = totalUsage.outputTokens ?? 0;
        const cacheReadTokens =
          totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
        const cacheWriteTokens =
          totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0;

        // Build the agent's tool parts (the cockpit's source of truth) +
        // collect its full text. TEXT CHAT IS SINGLE-AGENT: the persisted
        // message is [tool parts] + [the agent's FULL text] — no Agent A
        // narration/condensing. The two-agent split exists only on the voice
        // plane (the realtime worker narrates aloud; /api/voice-turn returns
        // this same full text for it to speak from).
        const assistantParts: Array<Record<string, unknown>> = [];

        for (const step of steps) {
          for (const tc of step.toolCalls) {
            // Match by toolCallId, never by index: toolResults excludes
            // tool-ERROR parts, so with calls [A, B] where A errored, index
            // pairing would persist A with B's output — and that corrupted
            // transcript feeds back into the model on every later turn.
            const tr = step.toolResults.find(
              (r) => r.toolCallId === tc.toolCallId,
            );
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
            executorText += (executorText ? "\n\n" : "") + stepText;
          }
        }

        if (executorText.trim()) {
          assistantParts.push({ type: "text" as const, text: executorText });
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

        // Fire-and-forget post-response tasks.
        // Context size = the FINAL step's usage (its inputTokens already span
        // the whole context). totalUsage sums every step, so a 5-step tool turn
        // would count the context 5x over and fire compaction/memory-flush on
        // conversations nowhere near the window.
        const lastStep = steps[steps.length - 1];
        const totalContextTokens =
          (lastStep?.usage.inputTokens ?? inputTokens) +
          (lastStep?.usage.outputTokens ?? outputTokens);
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
        // NOTE: the resumable-stream pointer is cleared by the web chat route
        // (which owns the streamId) — clearing it here clobbered a live web
        // stream's pointer whenever a telegram/cron run on the same instance
        // finished first.
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
      closeMcp: () => mcp.close(),
    },
  };
}

export type {
  PrepareAgentRunParams,
  PrepareResult,
  PrepareAgentRunResult,
  MessageSource,
};
