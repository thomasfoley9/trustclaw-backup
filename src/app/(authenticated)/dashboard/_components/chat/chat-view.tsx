"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import type { UIMessage } from "@ai-sdk/react";
import { Loader2, ArrowDown } from "lucide-react";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { Button } from "~/components/ui/button";
import { useTerminalStore } from "../terminal-store";
import { useChatHook, type ChatFilePart } from "../use-chat-hook";
import { UserMessage } from "./user-message";
import { AssistantMessage } from "./assistant-message/assistant-message";
import { ThinkingIndicator } from "./assistant-message/thinking-indicator";
import { ChatInput } from "./chat-input";
import { TerminalPane } from "../terminal/terminal-pane";
import { ComposioCta } from "./composio-cta";

const SAMPLE_PROMPTS = [
  "Summarize my emails for today",
  "What's on my calendar for tomorrow",
  "Catch me up on latest messages on Slack",
];

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 120;

interface ChatViewProps {
  initialMessages: UIMessage[];
  streamId: string | null;
  conversationId: string;
  // A run for this session is executing server-side (started before this view
  // mounted - e.g. user switched away and back).
  backgroundRunActive?: boolean;
  historyPageCount: number;
  fetchOlderMessages: () => void;
  hasOlderMessages: boolean;
  isFetchingOlderMessages: boolean;
}

export function ChatView({
  initialMessages,
  streamId,
  conversationId,
  backgroundRunActive = false,
  historyPageCount,
  fetchOlderMessages,
  hasOlderMessages,
  isFetchingOlderMessages,
}: ChatViewProps) {
  const { sendMessage, stop, messages, status, setMessages } = useChatHook({
    initialMessages,
    streamId,
    conversationId,
  });
  const terminalOpen = useTerminalStore((s) => s.terminalOpen);
  const setTerminalOpen = useTerminalStore((s) => s.setTerminalOpen);
  const isEmpty = messages.length === 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const isStreaming = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  // Show the thinking indicator both for a live local stream and for a
  // background run still executing server-side (e.g. after switching back).
  const backgroundBusy = backgroundRunActive && !isStreaming;
  const isWaitingForAssistant =
    (isStreaming && lastMessage?.role === "user") || backgroundBusy;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Prepend older history pages, preserving the visual scroll position so the
  // viewport doesn't jump when older messages load in above.
  const pageCountRef = useRef(historyPageCount);
  const prependAnchorRef = useRef<number | null>(null);
  useEffect(() => {
    if (historyPageCount <= pageCountRef.current) {
      pageCountRef.current = historyPageCount;
      return;
    }
    const el = scrollRef.current;
    prependAnchorRef.current = el ? el.scrollHeight - el.scrollTop : null;
    setMessages((current) => {
      const currentIds = new Set(current.map((m) => m.id));
      const newOlder = initialMessages.filter((m) => !currentIds.has(m.id));
      if (newOlder.length === 0) return current;
      return [...newOlder, ...current];
    });
    pageCountRef.current = historyPageCount;
  }, [historyPageCount, initialMessages, setMessages]);

  // Restore scroll position right after a prepend (before paint).
  useLayoutEffect(() => {
    if (prependAnchorRef.current != null && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
    }
  });

  // Keep pinned to the bottom: once on first paint, then on every new message
  // / streaming chunk as long as the user is already near the bottom.
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!initialScrolledRef.current) {
      initialScrolledRef.current = true;
      requestAnimationFrame(() => scrollToBottom("auto"));
      return;
    }
    if (prependAnchorRef.current != null) return; // prepend handled above
    if (atBottomRef.current) {
      scrollToBottom(isStreaming ? "auto" : "smooth");
    }
  }, [messages, isStreaming, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_PX;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (el.scrollTop < NEAR_TOP_PX && hasOlderMessages && !isFetchingOlderMessages) {
      fetchOlderMessages();
    }
  }, [hasOlderMessages, isFetchingOlderMessages, fetchOlderMessages]);

  const handleSend = useCallback(
    (text: string, files?: ChatFilePart[]) => {
      const result = sendMessage(text, files);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      return result;
    },
    [sendMessage, scrollToBottom],
  );

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <ComposioCta />
        <div className="relative min-h-0 flex-1">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex flex-wrap justify-center gap-2">
                {SAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      void handleSend(prompt);
                    }}
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-4 py-2 text-sm transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto"
            >
              {isFetchingOlderMessages && (
                <div className="flex justify-center py-3">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8"
                >
                  <ErrorBoundary
                    fallback={
                      <p className="text-muted-foreground text-sm italic">
                        Failed to render message
                      </p>
                    }
                  >
                    {message.role === "user" ? (
                      <UserMessage message={message} />
                    ) : (
                      <AssistantMessage
                        message={message}
                        status={
                          message.id === lastMessage?.id ? status : "ready"
                        }
                        onOpenTerminal={() => setTerminalOpen(true)}
                      />
                    )}
                  </ErrorBoundary>
                </div>
              ))}
              <div className="pb-4 md:pb-6">
                {isWaitingForAssistant && (
                  <div className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">
                    <ThinkingIndicator />
                  </div>
                )}
              </div>
            </div>
          )}

          {!atBottom && !isEmpty && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => scrollToBottom("smooth")}
              className="absolute bottom-4 left-1/2 size-10 -translate-x-1/2 rounded-full shadow-md"
            >
              <ArrowDown className="size-4" />
            </Button>
          )}
        </div>

        <ChatInput
          onSend={handleSend}
          onStop={stop}
          status={status}
          backgroundBusy={backgroundBusy}
        />
      </div>

      {terminalOpen && (
        <div className="border-border hidden w-[400px] shrink-0 border-l md:block lg:w-[500px]">
          <TerminalPane
            messages={messages}
            status={status}
            onHide={() => setTerminalOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
