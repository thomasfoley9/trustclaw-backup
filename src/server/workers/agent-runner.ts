import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import type { MessageSource } from "~/server/api/routers/trustclaw/agent/setup";

export interface RunAgentInput {
  instanceId: string;
  userMessage: string;
  source: MessageSource;
  conversationId?: string;
  dedicatedConversationTitle?: string;
  attachments?: Array<{ name: string; mediaType: string; data: string }>;
  userMessageType?: "hidden";
  // Lets a caller (e.g. a hung-up voice session) cancel an in-flight run.
  abortSignal?: AbortSignal;
}

export interface RunAgentResult {
  conversationId: string;
  text: string;
}

/**
 * Portable, non-streaming agent run callable from any runtime - the existing
 * Vercel background path today, and (Phase 2) the standalone worker process.
 *
 * Wraps prepareAgentRun + agent.generate(). All persistence (assistant row,
 * memory flush, compaction, cleanup) already runs inside the agent's onFinish,
 * so callers receive only the final text; errors propagate to the caller.
 *
 * This is the single seam the worker tier reuses (see docs/audio-mode-plan.md
 * §4). It deliberately mirrors the telegram/cron consumers, which already drive
 * runs to completion via agent.generate() - NOT the web streaming path, which
 * stays untouched.
 */
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { abortSignal, ...prepareParams } = input;

  const prepared = await prepareAgentRun(prepareParams);
  const { agent, messages, conversationId } = prepared.result;

  const result = await agent.generate({
    prompt: messages,
    ...(abortSignal ? { abortSignal } : {}),
  });

  return { conversationId, text: result.text };
}
