import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet, SystemModelMessage } from "ai";
import { db } from "~/server/clients/db";
import { getComposioForInstance } from "~/server/clients/composio";
import { loadMcpTools } from "~/server/clients/mcp";
import { resolveAgentModel, isHouseModel } from "./resolve-model";
import {
  isPersonaPinned,
  resolvePersonalityId,
  resolvePinnedPrompt,
} from "./persona-pin";
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
import { applyEaLeash } from "~/server/ea/leash";
import type { ReconstructedMessage } from "./types";

type MessageSource = "web" | "telegram" | "cron" | "slack" | "sms";

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
  // Re-run of the conversation's last user turn: the user row is already in
  // the DB, so don't persist it again or append it to the built context (the
  // loaded history already ends with it). The caller removes the old reply.
  regenerate?: boolean;
  // Forces this run onto a specific persona instead of the instance's current
  // one ("none" = the default voice). Used by live voice calls: the spoken
  // agent's persona is fixed at dispatch and cannot change mid-call, so the
  // delegate must stay pinned to it or the call speaks in the old voice while
  // wording replies as a newly-picked persona.
  pinnedPersonalityId?: string | null;
  // The persona prompt/name captured at dispatch. Preferred over re-reading
  // the personality row, so editing or deleting it mid-call cannot desync the
  // delegate from the voice (or drop it to the default character mid-call).
  pinnedPersonaPrompt?: string | null;
  pinnedPersonaName?: string | null;
}

interface PrepareAgentRunResult {
  agent: ToolLoopAgent;
  messages: ReconstructedMessage[];
  // The session this run resolved to (pinned, dedicated, or active).
  conversationId: string;
  // The selected model id (e.g. "house/kimi-k3", "claude-...", "deepseek/...").
  // Lets error surfaces attribute provider failures correctly instead of
  // blaming the user's Anthropic account for a house/custom-model outage.
  selectedModel: string;
  // The pre-created (empty) assistant row this run will fill. Callers that
  // settle an aborted run themselves must target THIS row - matching on "any
  // empty assistant row in the conversation" would also hit orphans left by
  // earlier turns in the same thread.
  assistantMessageId: string;
  // Tears down the run's MCP clients. onFinish closes them on a normal finish,
  // but aborted runs (Stop) and zero-step provider errors never reach onFinish
  // - callers MUST also invoke this from their own cleanup (it's idempotent).
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
    regenerate = false,
    pinnedPersonalityId = null,
    pinnedPersonaPrompt = null,
    pinnedPersonaName = null,
  } = params;

  // Select only what this function reads - the full row drags every prompt
  // blob and encrypted key across the wire on EVERY agent turn.
  const instance = await db.composioClawInstance.findUnique({
    where: { id: instanceId },
    select: {
      userId: true,
      incognitoMode: true,
      activeMemoryBucket: true,
      activeConversationId: true,
      activePersonalityId: true,
      soulPrompt: true,
      identityPrompt: true,
      userPrompt: true,
      anthropicModel: true,
      presenceEnabled: true,
      eaSlackChannelId: true,
    },
  });

  if (!instance) {
    throw new Error("Instance not found");
  }

  const user = await db.user.findUnique({
    where: { id: instance.userId },
    select: { timezone: true },
  });

  const userTimezone = user?.timezone ?? "UTC";

  // Incognito is an interactive-surface privacy mode. Cron runs are unattended
  // and depend on memory/knowledge injection - a forgotten ghost toggle must
  // not silently gut scheduled tasks or hide their output.
  const incognito = instance.incognitoMode && source !== "cron";
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
        // Best-effort orphan cleanup - never fail the run over it, but log so a
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

  // Active personality overrides the instance soul prompt when set. A pinned
  // persona (live voice call) wins over the instance's current selection, so a
  // mid-call switch cannot desync this run from the spoken agent; the sentinel
  // "none" pins the run to the default voice.
  const isPinned = isPersonaPinned(pinnedPersonalityId);
  const resolvedPersonalityId = resolvePersonalityId(
    pinnedPersonalityId,
    instance.activePersonalityId,
  );
  // A pinned call replays the prompt captured at dispatch instead of
  // re-resolving the row, so editing or deleting the personality mid-call
  // can't desync this run from the voice (deleting it used to drop the
  // delegate to the uncensored house character, identity prompt and all).
  const pinnedPrompt = resolvePinnedPrompt(
    pinnedPersonalityId,
    pinnedPersonaPrompt,
  );
  const activePersonality =
    !pinnedPrompt && resolvedPersonalityId
      ? await db.personality.findUnique({
          where: { id: resolvedPersonalityId },
          select: { name: true, prompt: true, instanceId: true },
        })
      : null;
  // Ownership is enforced on the pinned snapshot at write time
  // (api/livekit-token scopes its lookup by instanceId).
  const personaApplies = pinnedPrompt
    ? true
    : activePersonality?.instanceId === instanceId;
  const effectiveSoulPrompt =
    pinnedPrompt ??
    (personaApplies && activePersonality
      ? activePersonality.prompt
      : instance.soulPrompt);
  const activePersonalityName = pinnedPrompt
    ? pinnedPersonaName
    : personaApplies && activePersonality
      ? activePersonality.name
      : null;
  const currentPersonalityId =
    personaApplies && (pinnedPrompt ?? activePersonality)
      ? resolvedPersonalityId
      : null;

  // Detect a mid-conversation personality switch. When it changes, the prior
  // assistant turns in this session anchor the model to the old tone; a
  // recency-positioned note on the new user turn forces the new voice. Only
  // for visible user turns - cron/incognito triggers don't need tone notes.
  // lastPersonalityId uses the sentinel "none" (not null) once a turn has run
  // with no persona, so off->on transitions are detectable; null still means
  // "no prior tracked turn" (fresh conversation - no note needed).
  // A pinned run never gets a switch note: the pin exists precisely to hold
  // the persona steady, so telling the model to "drop the previous tone" would
  // fight it (and the spoken agent could not follow the instruction anyway).
  const personaSwitched =
    !incognito &&
    !userMessageType &&
    !isPinned &&
    !!conversation.lastPersonalityId &&
    conversation.lastPersonalityId !== (currentPersonalityId ?? "none");

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
  // independent reads that all feed buildSystemPrompt() - fetch them
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
      // The unhinged house persona is the DEFAULT skin for house models, not a
      // hard mode: an explicitly selected personality wins on any model.
      // Otherwise the personality toggle silently does nothing for everyone on
      // free Kimi/DeepSeek (the mainstream path since key-less onboarding).
      uncensored: isHouseModel(instance.anthropicModel) && !personaApplies,
      incognito,
    }),
  );

  // The model sees a switch note when the persona just changed; the persisted
  // user message (below) stays the raw text. Turning a persona OFF needs the
  // note just as much - the prior turns anchor the old voice.
  let modelUserMessage = userMessage;
  if (personaSwitched) {
    modelUserMessage = activePersonalityName
      ? `[Your active personality was just switched to "${activePersonalityName}". Starting with this reply, fully adopt the ${activePersonalityName} voice and drop the previous tone entirely.]\n\n${userMessage}`
      : `[Your active personality was just turned off. Starting with this reply, drop that voice entirely and return to your default voice.]\n\n${userMessage}`;
  }

  // Anthropic prompt-caching options are meaningless to OpenAI-compatible house
  // models - only attach them for Anthropic-backed models.
  const isHouse = isHouseModel(instance.anthropicModel);

  // Build attachment parts. Images are native model parts everywhere; PDFs are
  // native parts only on Anthropic-backed models (the OpenAI-compatible chat
  // completions path the house models use rejects file parts); text-like files
  // are inlined into the message text. The persisted message stores lightweight
  // markers only (no bytes), so DB and future context stay lean - attachments
  // inform the turn they're sent on.
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
    } else if (att.mediaType === "application/pdf" && !isHouse) {
      mediaParts.push({
        type: "file",
        data: new Uint8Array(bytes),
        mediaType: "application/pdf",
        filename: att.name,
      });
    } else if (att.mediaType === "application/pdf") {
      modelUserMessage += `\n\n[Attached PDF "${att.name}" - the free house models can't read PDFs natively; ask the user to share it as text/CSV or switch to a Claude model to read it directly.]`;
    } else if (isTextual(att)) {
      const text = bytes.toString("utf8").slice(0, 200_000);
      modelUserMessage += `\n\n--- Attached file: ${att.name} ---\n${text}`;
    } else {
      modelUserMessage += `\n\n[Attached file "${att.name}" (${att.mediaType}) - unsupported format; ask the user to share it as PDF, CSV, or text if you need its contents.]`;
    }
  }

  const userContent =
    mediaParts.length > 0
      ? [{ type: "text" as const, text: modelUserMessage }, ...mediaParts]
      : modelUserMessage;
  // Used to scrub the note from post-response tasks (memory flush) so the
  // switch instruction can never be saved as a durable "memory".
  const personaSwitchNoteRe =
    /^\[Your active personality was just (?:switched|turned off)[^\]]*\]\n\n/;

  const dbMessages = incognito
    ? []
    : await loadContextMessages(conversationId, conversation.lastCompactionAt);
  const aiMessages = buildContext(
    dbMessages,
    incognito ? null : conversation.lastCompactionSummary,
    // On regenerate the loaded history already ends with this user turn -
    // appending it again would send it to the model twice.
    regenerate ? null : userContent,
  );

  const contextWindow = getContextWindow(instance.anthropicModel);
  const { messages: prunedMessages } = pruneContext(aiMessages, contextWindow);

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

  if (!regenerate) {
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
  }

  // Title and recency update up front for visible user messages. The persona
  // tracker (lastPersonalityId) is deliberately NOT advanced here - a run can
  // still fail at the Composio/model preconditions below, and advancing early
  // would consume the one-shot switch note so the retry loses the new voice.
  // It moves forward in onFinish, after a reply actually landed.
  if (!incognito && !regenerate) {
    const isVisible = !effectiveMessageType;
    const isFirstTitle = conversation.title === "New chat";
    if (isVisible) {
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
  }

  // The Composio session (key load → connection setup → tool fetch) and the
  // user's MCP servers load independently, so run them concurrently - this is
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

  // The EA leash wraps send-class capability while Presence Mode is on:
  // outbound sends intercept into drafts plus approval tasks, enforced here
  // in code, never only in the prompt. Presence off = legacy behavior.
  const allTools: ToolSet = applyEaLeash(
    sanitizeToolResults({
      ...composioTools,
      ...customTools,
      ...mcp.tools,
    }),
    {
      instanceId,
      enabled: instance.presenceEnabled,
      eaSlackChannelId: instance.eaSlackChannelId,
    },
  );

  // Resolve the model first (house models ride owner keys; Claude/custom
  // models ride the user's own key). Fails closed with a PRECONDITION_FAILED
  // before we create the assistant row if the needed key is missing.
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
        // message is [tool parts] + [the agent's FULL text] - no Agent A
        // narration/condensing. The two-agent split exists only on the voice
        // plane (the realtime worker narrates aloud; /api/voice-turn returns
        // this same full text for it to speak from).
        const assistantParts: Array<Record<string, unknown>> = [];

        for (const step of steps) {
          for (const tc of step.toolCalls) {
            // Match by toolCallId, never by index: toolResults excludes
            // tool-ERROR parts, so with calls [A, B] where A errored, index
            // pairing would persist A with B's output - and that corrupted
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

        // A reply landed - NOW advance the persona tracker ("none" sentinel
        // when no persona is active) so the switch note fired exactly once.
        if (!incognito) {
          await db.conversation
            .update({
              where: { id: conversationId },
              data: { lastPersonalityId: currentPersonalityId ?? "none" },
            })
            .catch(() => undefined);
        }

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
        // (which owns the streamId) - clearing it here clobbered a live web
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
      selectedModel: instance.anthropicModel,
      assistantMessageId: assistantMessageRow.id,
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
