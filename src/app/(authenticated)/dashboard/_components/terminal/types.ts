import type { ChatStatus, DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";

type AnyToolUIPart = DynamicToolUIPart | ToolUIPart;

export interface TerminalLogEntryData {
  id: string;
  toolName: string;
  status: "executing" | "complete" | "error";
  timestamp: Date;
  args: Record<string, unknown>;
  result?: unknown;
}

// Module-level so timestamps stay stable across re-renders. Capped: without a
// bound this grows one entry per tool call for the lifetime of the tab. Map
// preserves insertion order, so evicting the first key drops the oldest call
// (which has long since scrolled out of any rendered window).
const TIMESTAMP_CACHE_MAX = 500;
const timestampCache = new Map<string, Date>();

export function toolCallToLogEntry(
  toolCall: AnyToolUIPart,
  chatStatus: ChatStatus,
): TerminalLogEntryData {
  if (!timestampCache.has(toolCall.toolCallId)) {
    if (timestampCache.size >= TIMESTAMP_CACHE_MAX) {
      const oldest = timestampCache.keys().next().value;
      if (oldest !== undefined) timestampCache.delete(oldest);
    }
    timestampCache.set(toolCall.toolCallId, new Date());
  }

  const isComplete =
    toolCall.state === "output-available" || toolCall.state === "output-error";
  const isError = toolCall.state === "output-error";

  return {
    id: toolCall.toolCallId,
    toolName: getToolName(toolCall),
    status: isComplete
      ? isError
        ? "error"
        : "complete"
      : chatStatus === "error"
        ? "error"
        : "executing",
    timestamp: timestampCache.get(toolCall.toolCallId)!,
    args: (toolCall.input ?? {}) as Record<string, unknown>,
    result: toolCall.state === "output-available" ? toolCall.output : undefined,
  };
}
