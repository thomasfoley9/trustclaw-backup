import type { UIMessage } from "@ai-sdk/react";

// Timestamp + token totals attached by trustclaw-chat when mapping persisted
// rows to UIMessages. Live streamed messages have no metadata until the
// post-finish refetch adopts the persisted row.
export interface MessageMeta {
  createdAt?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export function messageMeta(message: UIMessage): MessageMeta {
  const m = message.metadata;
  if (typeof m !== "object" || m === null) return {};
  const rec = m as Record<string, unknown>;
  return {
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : undefined,
    inputTokens:
      typeof rec.inputTokens === "number" ? rec.inputTokens : undefined,
    outputTokens:
      typeof rec.outputTokens === "number" ? rec.outputTokens : undefined,
  };
}
