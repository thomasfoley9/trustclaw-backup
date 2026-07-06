"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp,
  Square,
  Paperclip,
  X,
  FileText,
  Mic,
  Volume2,
  VolumeX,
  PhoneCall,
  PhoneOff,
  Ear,
  Loader2,
  AudioLines,
  MicOff,
} from "lucide-react";
import type { ConversationPhase } from "./use-voice-conversation";
import type { ChatStatus } from "ai";
import { VoicePicker } from "./voice-picker";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { showErrorToast } from "~/components/core/toast-notifications";
import type { ChatFilePart } from "../use-chat-hook";
import { ModelPicker } from "./model-picker";
import { useSpeechDictation } from "./use-speech-dictation";

interface ChatInputProps {
  onSend: (message: string, files?: ChatFilePart[]) => void;
  onStop: () => void;
  status: ChatStatus;
  // A server-side background run is executing for this session (no local
  // stream). Input is blocked and the stop button targets the server run.
  backgroundBusy?: boolean;
  // Voice mode: speak assistant replies aloud (Smallest.ai TTS).
  voiceEnabled: boolean;
  voiceSpeaking: boolean;
  onToggleVoice: () => void;
  // Hands-free conversation loop (browser-native STT -> auto-send -> spoken reply).
  conversationSupported: boolean;
  conversationActive: boolean;
  conversationPhase: ConversationPhase;
  conversationMuted: boolean;
  onStartConversation: () => void;
  onStopConversation: () => void;
  onToggleMute: () => void;
}

const CONVERSATION_STATUS: Record<
  Exclude<ConversationPhase, "off">,
  { icon: typeof Ear; label: string }
> = {
  listening: { icon: Ear, label: "Listening…" },
  thinking: { icon: Loader2, label: "Thinking…" },
  speaking: { icon: AudioLines, label: "Speaking…" },
  muted: { icon: MicOff, label: "Muted" },
};

// Both caps must match app/api/chat/route.ts (MAX_MESSAGE_CHARS and the
// TOTAL attachment budget) - a looser client cap lets users compose sends
// the server then rejects without persisting anything.
const MAX_MESSAGE_LENGTH = 32_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
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
  voiceEnabled,
  voiceSpeaking,
  onToggleVoice,
  conversationSupported,
  conversationActive,
  conversationPhase,
  conversationMuted,
  onStartConversation,
  onStopConversation,
  onToggleMute,
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

  const handleDictationFinal = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    textareaRef.current?.focus();
  }, []);
  const {
    isSupported: micSupported,
    isListening,
    toggle: toggleDictation,
    stop: stopDictation,
  } = useSpeechDictation({ onFinal: handleDictationFinal });

  // Stop dictation if a response starts streaming.
  useEffect(() => {
    if (isStreaming && isListening) stopDictation();
  }, [isStreaming, isListening, stopDictation]);

  // Restore focus to the composer when a reply finishes, so the next message
  // doesn't require re-clicking the box. Skip on coarse pointers (touch) to
  // avoid popping the mobile keyboard open unprompted.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const finePointer =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)").matches;
    if (wasStreamingRef.current && !isStreaming && finePointer) {
      textareaRef.current?.focus();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Stop push-to-talk dictation when the hands-free loop starts, so two
  // SpeechRecognition instances don't fight over the mic.
  useEffect(() => {
    if (conversationActive && isListening) stopDictation();
  }, [conversationActive, isListening, stopDictation]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_FILES - attachments.length;
      if (room <= 0) {
        showErrorToast(`You can attach up to ${MAX_FILES} files`);
        return;
      }
      const accepted: Attachment[] = [];
      // Track the running TOTAL (server enforces a combined cap, not per-file;
      // data URLs inflate bytes ~4/3, so budget on the encoded size).
      let totalBytes = attachments.reduce(
        (sum, a) => sum + a.dataUrl.length,
        0,
      );
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_FILE_BYTES) {
          showErrorToast(`"${file.name}" is over 25MB`);
          continue;
        }
        if (totalBytes + Math.ceil((file.size * 4) / 3) > MAX_TOTAL_ATTACHMENT_BYTES) {
          showErrorToast(
            `"${file.name}" would push attachments over the 25MB total limit`,
          );
          continue;
        }
        try {
          const dataUrl = await readAsDataUrl(file);
          totalBytes += dataUrl.length;
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
    [attachments],
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

        {conversationActive && conversationPhase !== "off" && (
          <div
            className={cn(
              "mb-2 flex items-center justify-between gap-2 rounded-2xl border px-3 py-2",
              conversationMuted
                ? "border-border bg-muted/40"
                : "border-primary/30 bg-primary/10",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                conversationMuted ? "text-muted-foreground" : "text-primary",
              )}
            >
              {(() => {
                const { icon: Icon, label } =
                  CONVERSATION_STATUS[conversationPhase];
                return (
                  <>
                    <Icon
                      className={cn(
                        "size-4",
                        !conversationMuted &&
                          conversationPhase === "thinking" &&
                          "animate-spin",
                        !conversationMuted &&
                          conversationPhase !== "thinking" &&
                          "animate-pulse",
                      )}
                    />
                    <span>{label}</span>
                  </>
                );
              })()}
            </div>
            <button
              type="button"
              onClick={onToggleMute}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                conversationMuted
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-label={
                conversationMuted ? "Unmute microphone" : "Mute microphone"
              }
              aria-pressed={conversationMuted}
            >
              {conversationMuted ? (
                <>
                  <Mic className="size-3.5" />
                  Tap to talk
                </>
              ) : (
                <>
                  <MicOff className="size-3.5" />
                  Mute
                </>
              )}
            </button>
          </div>
        )}

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

        {/* Voice & attachment controls - their own strip so the composer gets
            the full row width. All buttons fit on mobile again. */}
        <div className="mb-1.5 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            aria-label="Attach files"
          >
            <Paperclip className="size-4" />
          </Button>

          {micSupported && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 shrink-0 rounded-xl",
                isListening && "bg-primary/15 text-primary",
              )}
              onClick={toggleDictation}
              disabled={isStreaming || conversationActive}
              aria-label={
                isListening ? "Stop voice dictation" : "Start voice dictation"
              }
              aria-pressed={isListening}
            >
              <Mic className={cn("size-4", isListening && "animate-pulse")} />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-9 shrink-0 rounded-xl",
              voiceEnabled && "bg-primary/15 text-primary",
            )}
            onClick={onToggleVoice}
            aria-label={
              voiceEnabled ? "Turn off spoken replies" : "Turn on spoken replies"
            }
            aria-pressed={voiceEnabled}
          >
            {voiceEnabled ? (
              <Volume2
                className={cn("size-4", voiceSpeaking && "animate-pulse")}
              />
            ) : (
              <VolumeX className="size-4" />
            )}
          </Button>

          {conversationSupported && <VoicePicker disabled={isStreaming} />}

          {conversationSupported && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 shrink-0 rounded-xl",
                conversationActive && "bg-primary/15 text-primary",
              )}
              onClick={
                conversationActive ? onStopConversation : onStartConversation
              }
              aria-label={
                conversationActive
                  ? "End hands-free conversation"
                  : "Start hands-free conversation"
              }
              aria-pressed={conversationActive}
            >
              {conversationActive ? (
                <PhoneOff className="size-4" />
              ) : (
                <PhoneCall className="size-4" />
              )}
            </Button>
          )}
        </div>

        <div className="flex items-end gap-2">
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
              "border-border bg-card/60 max-h-[200px] min-h-[44px] resize-none rounded-2xl text-base md:text-sm",
              "placeholder:text-muted-foreground/50",
              "focus-visible:border-primary/40 focus-visible:ring-primary/25 focus-visible:ring-[3px]",
            )}
          />

          {isStreaming ? (
            <Button
              variant="default"
              size="icon"
              aria-label="Stop response"
              className="size-10 shrink-0 rounded-2xl"
              onClick={handleStop}
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              aria-label="Send message"
              className={cn(
                "bg-accent-gradient size-10 shrink-0 rounded-2xl border-0 text-white shadow-md transition-transform hover:scale-105",
                !canSend && "opacity-50 hover:scale-100",
              )}
              onClick={handleSubmit}
              disabled={!canSend}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>

        <div className="mt-1.5 flex items-center">
          <ModelPicker />
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
