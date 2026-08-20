"use client";

import { ExternalLink, Check } from "lucide-react";
import { getToolName } from "ai";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { ToolInvocation } from "../../terminal/tool-invocation";
import Link from "next/link";
import { parseManageConnectionsResult } from "../../tool-results/connections/schema";
import { trpc } from "~/clients/trpc";

interface InlineConnectionAction {
  toolkit: string;
  redirectUrl: string;
}

function getInlineConnectionActions(
  toolCall: DynamicToolUIPart | ToolUIPart,
): InlineConnectionAction[] {
  const toolName = getToolName(toolCall);
  if (!toolName.endsWith("MANAGE_CONNECTIONS")) return [];
  if (toolCall.state !== "output-available" || !toolCall.output) return [];

  const args = (toolCall.input ?? {}) as Record<string, unknown>;
  const parsed = parseManageConnectionsResult(toolCall.output, args);
  if (!parsed) return [];

  const actions: InlineConnectionAction[] = [];
  for (const [toolkit, entry] of Object.entries(parsed.results)) {
    if (entry.redirect_url?.startsWith("https://")) {
      actions.push({ toolkit, redirectUrl: entry.redirect_url });
    }
  }
  return actions;
}

function getGeneratedImageUrl(
  toolCall: DynamicToolUIPart | ToolUIPart,
): string | null {
  if (getToolName(toolCall) !== "generate_image") return null;
  if (toolCall.state !== "output-available" || !toolCall.output) return null;
  const out = toolCall.output as Record<string, unknown>;
  return typeof out.url === "string" ? out.url : null;
}

interface ToolCallSegmentProps {
  toolCall: DynamicToolUIPart | ToolUIPart;
  onOpenTerminal: () => void;
}

export function ToolCallSegment({
  toolCall,
  onOpenTerminal,
}: ToolCallSegmentProps) {
  const generatedImageUrl = getGeneratedImageUrl(toolCall);
  const connectionActions = getInlineConnectionActions(toolCall);

  const allToolkits = connectionActions.map((a) => a.toolkit);

  const connectionStatus = trpc.trustclaw.checkConnectionStatus.useQuery(
    { toolkits: allToolkits },
    {
      enabled: allToolkits.length > 0,
      // OAuth completes in another tab with no way to notify this one: the
      // 30s global staleTime would otherwise gate the focus refetch, and the
      // poll covers the user finishing OAuth without ever refocusing.
      refetchOnWindowFocus: "always",
      refetchInterval: (query) =>
        query.state.data?.statuses.every((s) => s.connected) ? false : 5000,
    },
  );

  const connectedToolkits = new Set(
    connectionStatus.data?.statuses
      .filter((s) => s.connected)
      .map((s) => s.toolkit) ?? [],
  );

  const handleClick = () => {
    onOpenTerminal();
    window.dispatchEvent(
      new CustomEvent("tool-focus", {
        detail: { toolCallId: toolCall.toolCallId },
      }),
    );
  };

  return (
    <div className="my-2 space-y-2">
      <ToolInvocation toolCall={toolCall} onClick={handleClick} />
      {generatedImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- runtime-generated local image with unknown dimensions
        <img
          src={generatedImageUrl}
          alt="Generated image"
          className="border-border max-h-[512px] w-auto max-w-full rounded-lg border"
        />
      )}
      {connectionActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {connectionActions.map((action) =>
            connectedToolkits.has(action.toolkit) ? (
              <span
                key={action.toolkit}
                className="text-primary border-primary/30 bg-primary/5 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
              >
                <Check className="size-3" />
                {action.toolkit} connected
              </span>
            ) : (
              <Link
                key={action.toolkit}
                href={action.redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-fast ease-out-quad"
              >
                Connect {action.toolkit}
                <ExternalLink className="size-3" />
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
