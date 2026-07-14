"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import moment from "moment";
import { Copy, Check, RefreshCw } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatStatus, DynamicToolUIPart, ToolUIPart } from "ai";
import { isToolUIPart } from "ai";
import { ThinkingIndicator } from "./thinking-indicator";
import { ToolCallSegment } from "./tool-call-segment";
import { CodeBlock } from "./code-block";
import { messageMeta } from "../message-metadata";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import { PROSE_CLASSES } from "./prose-classes";

// Assistant replies regularly contain external links and code - links must
// never navigate the chat away, and tables must scroll instead of blowing out
// the bubble width.
const MARKDOWN_COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
};

type TextUIPart = { type: "text"; text: string };

type MessageSegment =
  | { kind: "text"; parts: TextUIPart[] }
  | { kind: "tool-call"; part: DynamicToolUIPart | ToolUIPart };

function segmentParts(parts: UIMessage["parts"]): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let textAccum: TextUIPart[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      textAccum.push(part);
    } else if (isToolUIPart(part)) {
      if (textAccum.length > 0) {
        segments.push({ kind: "text", parts: textAccum });
        textAccum = [];
      }
      segments.push({ kind: "tool-call", part });
    }
  }
  if (textAccum.length > 0) {
    segments.push({ kind: "text", parts: textAccum });
  }
  return segments;
}

interface AssistantMessageProps {
  message: UIMessage;
  status: ChatStatus;
  onOpenTerminal: () => void;
  // Set only on the last assistant message while idle - re-runs the turn.
  onRegenerate?: () => void;
}

export function AssistantMessage({
  message,
  status,
  onOpenTerminal,
  onRegenerate,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Re-segmenting on every parent re-render (frequent during streaming + voice
  // transcript updates) is wasted work when this message's parts are unchanged.
  const segments = useMemo(() => segmentParts(message.parts), [message.parts]);

  const meta = messageMeta(message);
  const tokenTotal = (meta.inputTokens ?? 0) + (meta.outputTokens ?? 0);

  const getFullTextContent = () =>
    segments
      .filter(
        (s): s is Extract<MessageSegment, { kind: "text" }> =>
          s.kind === "text",
      )
      .map((s) => stripToolResultEchoes(s.parts.map((p) => p.text).join("")))
      .filter(Boolean)
      .join("\n");

  const hasTextContent = segments.some((s) => s.kind === "text");

  const handleCopy = () => {
    void navigator.clipboard.writeText(getFullTextContent());
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  if (segments.length === 0) {
    if (status === "error") {
      return (
        <div className="text-destructive flex items-center gap-2 py-2 text-sm">
          <span>
            Something went wrong. Your message wasn&apos;t lost - try sending it
            again.
          </span>
        </div>
      );
    }

    if (status === "streaming" || status === "submitted") {
      return <ThinkingIndicator />;
    }

    return null;
  }

  return (
    <div className="space-y-1">
      {segments.map((segment, idx) => {
        if (segment.kind === "text") {
          const textContent = stripToolResultEchoes(
            segment.parts.map((p) => p.text).join(""),
          );
          if (!textContent) return null;

          return (
            <div key={`text-${idx}`}>
              <div className={`min-w-0 flex-1 ${PROSE_CLASSES}`}>
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={MARKDOWN_COMPONENTS}
                >
                  {textContent}
                </Markdown>
              </div>
            </div>
          );
        }

        return (
          <ToolCallSegment
            key={segment.part.toolCallId}
            toolCall={segment.part}
            onOpenTerminal={onOpenTerminal}
          />
        );
      })}

      {hasTextContent && (
        <div className="-m-2 flex items-center gap-1">
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy reply"}
            className="text-muted-foreground/50 hover:text-muted-foreground p-2 transition-colors"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              aria-label="Regenerate reply"
              className="text-muted-foreground/50 hover:text-muted-foreground p-2 transition-colors"
            >
              <RefreshCw className="size-3.5" />
            </button>
          )}
          {(meta.createdAt !== undefined || tokenTotal > 0) && (
            <span className="text-muted-foreground/50 pl-1 text-xs">
              {meta.createdAt && moment(meta.createdAt).format("h:mm A")}
              {meta.createdAt && tokenTotal > 0 && " · "}
              {tokenTotal > 0 && `${tokenTotal.toLocaleString()} tokens`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
