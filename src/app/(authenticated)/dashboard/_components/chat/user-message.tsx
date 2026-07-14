"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import moment from "moment";
import { Copy, Check, FileText } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";
import { messageMeta } from "./message-metadata";

interface UserMessageProps {
  message: UIMessage;
}

interface RenderedAttachment {
  key: string;
  name: string;
  mediaType: string;
  url?: string;
}

// Attachments arrive two ways: as AI SDK "file" parts (live send, carry a data
// URL) or as our persisted "file-attachment" markers (reloaded history, name
// only). Normalize both for display.
function extractAttachments(message: UIMessage): RenderedAttachment[] {
  const parts = message.parts as Array<Record<string, unknown>>;
  const out: RenderedAttachment[] = [];
  parts.forEach((p, i) => {
    if (p.type === "file") {
      out.push({
        key: `f${i}`,
        name: typeof p.filename === "string" ? p.filename : "file",
        mediaType: typeof p.mediaType === "string" ? p.mediaType : "",
        url: typeof p.url === "string" ? p.url : undefined,
      });
    } else if (p.type === "file-attachment") {
      out.push({
        key: `a${i}`,
        name: typeof p.name === "string" ? p.name : "file",
        mediaType: typeof p.mediaType === "string" ? p.mediaType : "",
      });
    }
  });
  return out;
}

export function UserMessage({ message }: UserMessageProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const textContent = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  const fileAttachments = useMemo(() => extractAttachments(message), [message]);
  const { createdAt } = messageMeta(message);

  const handleCopy = () => {
    void navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-end">
      {fileAttachments.length > 0 && (
        <div className="mb-1 flex max-w-[80%] flex-wrap justify-end gap-2">
          {fileAttachments.map((a) =>
            a.mediaType.startsWith("image/") && a.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- inline attachment preview
              <img
                key={a.key}
                src={a.url}
                alt={a.name}
                className="border-border max-h-48 rounded-lg border object-cover"
              />
            ) : (
              <div
                key={a.key}
                className="border-border bg-muted flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="max-w-[200px] truncate text-xs">{a.name}</span>
              </div>
            ),
          )}
        </div>
      )}

      {textContent && (
        <div className="relative max-w-[80%]">
          <div className="border-primary/20 bg-primary/12 text-foreground rounded-2xl rounded-br-md border px-3.5 py-2 text-sm">
            <p className="break-words whitespace-pre-wrap">{textContent}</p>
          </div>
        </div>
      )}

      {textContent && (
        <div className="-m-2 mt-1 mr-1 flex items-center gap-1">
          {createdAt && (
            <span className="text-muted-foreground/50 pr-1 text-xs">
              {moment(createdAt).format("h:mm A")}
            </span>
          )}
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy message"}
            className="text-muted-foreground/50 hover:text-muted-foreground p-2 transition-colors"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
