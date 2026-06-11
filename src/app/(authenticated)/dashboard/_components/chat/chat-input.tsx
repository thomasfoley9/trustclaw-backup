"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Square, Paperclip, X, FileText } from "lucide-react";
import type { ChatStatus } from "ai";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { showErrorToast } from "~/components/core/toast-notifications";
import type { ChatFilePart } from "../use-chat-hook";

interface ChatInputProps {
  onSend: (message: string, files?: ChatFilePart[]) => void;
  onStop: () => void;
  status: ChatStatus;
  // A server-side background run is executing for this session (no local
  // stream). Input is blocked and the stop button targets the server run.
  backgroundBusy?: boolean;
}

const MAX_MESSAGE_LENGTH = 50_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 8;

interface Attachment {
  id: string;
  name: string;
  mediaType: string;
  dataUrl: string;
  isImage: boolean;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function ChatInput({
  onSend,
  onStop,
  status,
  backgroundBusy = false,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStreaming =
    status === "streaming" || status === "submitted" || backgroundBusy;
  const isTooLong = input.length > MAX_MESSAGE_LENGTH;
  const canSend =
    (input.trim().length > 0 || attachments.length > 0) &&
    !isStreaming &&
    !isTooLong;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_FILES - attachments.length;
      if (room <= 0) {
        showErrorToast(`You can attach up to ${MAX_FILES} files`);
        return;
      }
      const accepted: Attachment[] = [];
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_FILE_BYTES) {
          showErrorToast(`"${file.name}" is over 25MB`);
          continue;
        }
        try {
          const dataUrl = await readAsDataUrl(file);
          accepted.push({
            id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            mediaType: file.type || "application/octet-stream",
            dataUrl,
            isImage: file.type.startsWith("image/"),
          });
        } catch {
          showErrorToast(`Couldn't read "${file.name}"`);
        }
      }
      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
    },
    [attachments.length],
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    const fileParts: ChatFilePart[] = attachments.map((a) => ({
      type: "file",
      mediaType: a.mediaType,
      url: a.dataUrl,
      filename: a.name,
    }));
    onSend(input.trim(), fileParts);
    setInput("");
    setAttachments([]);
  }, [canSend, input, attachments, onSend]);

  const handleStop = useCallback(() => {
    onStop();
  }, [onStop]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  return (
    <div
      className={cn(
        "border-border bg-background border-t p-3 md:p-4",
        dragOver && "bg-accent/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) void addFiles(files);
      }}
    >
      <div className="mx-auto max-w-2xl">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="border-border bg-muted/50 relative flex items-center gap-2 rounded-lg border p-1.5 pr-7"
              >
                {a.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data-url preview
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="h-9 w-9 rounded object-cover"
                  />
                ) : (
                  <FileText className="text-muted-foreground h-5 w-5" />
                )}
                <span className="max-w-[140px] truncate text-xs">{a.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="text-muted-foreground hover:text-foreground absolute top-1 right-1"
                  aria-label="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.csv,.tsv,.txt,.md,.markdown,.json,.log,.xml,.yaml,.yml"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            aria-label="Attach files"
          >
            <Paperclip className="size-4" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              backgroundBusy
                ? "Answering in the background..."
                : isStreaming
                  ? "Waiting for response..."
                  : "Ask me anything..."
            }
            disabled={isStreaming}
            rows={1}
            className={cn(
              "border-border bg-muted/50 max-h-[200px] min-h-[44px] resize-none rounded-xl text-base md:text-sm",
              "placeholder:text-muted-foreground/50",
              "focus-visible:ring-ring focus-visible:ring-1",
            )}
          />

          {isStreaming ? (
            <Button
              variant="default"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              onClick={handleStop}
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              className={cn(
                "size-10 shrink-0 rounded-xl",
                !canSend && "opacity-50",
              )}
              onClick={handleSubmit}
              disabled={!canSend}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {isTooLong && (
        <p className="text-destructive mx-auto max-w-2xl text-xs">
          Message is too long ({input.length.toLocaleString()}/
          {MAX_MESSAGE_LENGTH.toLocaleString()})
        </p>
      )}
    </div>
  );
}
