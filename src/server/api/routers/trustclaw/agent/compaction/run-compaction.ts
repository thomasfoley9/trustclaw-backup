// Adapted from pi-mono: packages/coding-agent/src/core/compaction/compaction.ts:376-438 (cut point algorithm)
// Adaptive chunking / staged summarization from openclaw: src/agents/compaction.ts:110-129, 244-305
// Fallback chain from openclaw: src/agents/compaction.ts:176-242
import { generateText, type LanguageModel } from "ai";
import { Prisma } from "~/generated/prisma/client";
import { db } from "~/server/clients/db";
import { resolveAgentModel } from "../resolve-model";
import type { ReconstructedMessage } from "../types";
import {
  COMPACTION_SYSTEM_PROMPT,
  INITIAL_SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  MERGE_SUMMARIES_PROMPT,
  serializeMessages,
  buildToolFailuresSuffix,
} from "./prompts";
import { sanitizeString } from "../context/build-context";

interface CompactionParams {
  instanceId: string;
  conversationId: string;
  anthropicModel: string;
  // Messages BEFORE the cut point (already sliced by the caller, which
  // computes the cut over DB rows so it can also derive cutAt).
  messagesToCompact: ReconstructedMessage[];
  // createdAt of the first KEPT message - stored as lastCompactionAt so the
  // recent window stays loadable after compaction.
  cutAt: Date;
  previousSummary: string | null;
  compactionCount: number;
}

interface CompactionResult {
  summary: string;
  compactedMessageCount: number;
}

const ADAPTIVE_CHUNK_THRESHOLD = 100_000;
const LARGE_TOOL_RESULT_THRESHOLD = 10_000;

async function summarize(
  model: LanguageModel,
  conversationText: string,
  previousSummary: string | null,
): Promise<string> {
  const safeConversation = sanitizeString(conversationText);
  const safePreviousSummary = previousSummary ? sanitizeString(previousSummary) : null;

  let prompt: string;
  if (safePreviousSummary) {
    prompt = `<conversation>\n${safeConversation}\n</conversation>\n\n<previous-summary>\n${safePreviousSummary}\n</previous-summary>\n\n${UPDATE_SUMMARIZATION_PROMPT}`;
  } else {
    prompt = `<conversation>\n${safeConversation}\n</conversation>\n\n${INITIAL_SUMMARIZATION_PROMPT}`;
  }

  const result = await generateText({
    model,
    system: COMPACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    maxOutputTokens: 4_000,
  });

  return result.text;
}

async function stagedSummarize(
  model: LanguageModel,
  messages: ReconstructedMessage[],
  previousSummary: string | null,
): Promise<string> {
  const midpoint = Math.floor(messages.length / 2);
  const firstHalf = messages.slice(0, midpoint);
  const secondHalf = messages.slice(midpoint);

  const firstText = serializeMessages(firstHalf);
  const secondText = serializeMessages(secondHalf);

  const firstSummary = await summarize(model, firstText, previousSummary);

  const secondSummary = await summarize(model, secondText, firstSummary);

  const mergeResult = await generateText({
    model,
    system: COMPACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<summary-1>\n${firstSummary}\n</summary-1>\n\n<summary-2>\n${secondSummary}\n</summary-2>\n\n${MERGE_SUMMARIES_PROMPT}`,
      },
    ],
    maxOutputTokens: 4_000,
  });

  return mergeResult.text;
}

function stripLargeToolResults(
  messages: ReconstructedMessage[],
): ReconstructedMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "tool") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        const outputStr = JSON.stringify(part.output);
        if (outputStr.length > LARGE_TOOL_RESULT_THRESHOLD) {
          return { ...part, output: { type: "text" as const, value: "[Large tool result omitted]" } };
        }
        return part;
      }),
    };
  });
}

export async function runCompaction(
  params: CompactionParams,
): Promise<CompactionResult | null> {
  const { instanceId, conversationId, anthropicModel, messagesToCompact, cutAt, previousSummary, compactionCount } = params;

  if (messagesToCompact.length === 0) return null;

  const model = await resolveAgentModel(instanceId, anthropicModel);
  let summary: string;

  try {
    const conversationText = serializeMessages(messagesToCompact);

    if (conversationText.length > ADAPTIVE_CHUNK_THRESHOLD) {
      summary = await stagedSummarize(model, messagesToCompact, previousSummary);
    } else {
      summary = await summarize(model, conversationText, previousSummary);
    }
  } catch {
    try {
      const stripped = stripLargeToolResults(messagesToCompact);
      const strippedText = serializeMessages(stripped);
      summary = await summarize(model, strippedText, previousSummary);
    } catch {
      summary = `Conversation covered ${messagesToCompact.length} messages. Summary unavailable due to context limits.`;
    }
  }

  const failuresSuffix = buildToolFailuresSuffix(messagesToCompact);
  if (failuresSuffix) {
    summary += failuresSuffix;
  }

  const estimatedTokens = Math.ceil(summary.length / 4);

  try {
    await db.conversation.update({
      where: { id: conversationId, compactionCount },
      data: {
        lastCompactionSummary: summary,
        compactionCount: { increment: 1 },
        lastCompactionAt: cutAt,
        tokensAtCompaction: estimatedTokens,
      },
    });
  } catch (err) {
    // P2025 = the optimistic lock lost: a concurrent compaction already advanced
    // compactionCount. Benign — this run's summary is discarded and the next
    // turn recomputes from the winner's boundary. Anything else is a real
    // persistence failure that was previously invisible.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      console.warn(
        `[compaction] optimistic lock lost for conversation ${conversationId} — a concurrent compaction won; skipping`,
      );
    } else {
      console.error(
        `[compaction] failed to persist summary for conversation ${conversationId}:`,
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }

  return {
    summary,
    compactedMessageCount: messagesToCompact.length,
  };
}
