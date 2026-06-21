"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import { useVoicePlayback } from "./use-voice-playback";
import { useVoiceConversation } from "./use-voice-conversation";
import {
  VoiceCall,
  type VoiceCockpitEvent,
  type VoiceTranscriptEntry,
} from "./voice-call";
import { env } from "~/env";
import { TerminalPane } from "../terminal/terminal-pane";
import { ComposioCta } from "./composio-cta";
import { OpenClawLogo } from "~/app/_components/openclaw-logo";

const SAMPLE_PROMPTS = [
  "Summarize my emails for today",
  "What's on my calendar for tomorrow",
  "Catch me up on latest messages on Slack",
];

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 120;

// Plain text of an assistant message (text parts only — tool calls/results are
// skipped) for text-to-speech.
function assistantText(parts: UIMessage["parts"]): string {
  let out = "";
  for (const part of parts) {
    if (part.type === "text") out += (out ? " " : "") + part.text;
  }
  return out.trim();
}

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

  // Live voice-call overlay: ephemeral transcript lines + Agent B tool events
  // arriving over the LiveKit data channel during a call. Display-only — the
  // voice turn itself is persisted server-side to its own conversation thread.
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    VoiceTranscriptEntry[]
  >([]);
  const [voiceEvents, setVoiceEvents] = useState<VoiceCockpitEvent[]>([]);
  const clearVoiceOverlay = useCallback(() => {
    setVoiceTranscripts([]);
    setVoiceEvents([]);
  }, []);
  const handleTranscript = useCallback((entries: VoiceTranscriptEntry[]) => {
    // useTranscriptions emits a fresh array reference on every tick; skip the
    // state update (and re-render) when the content is unchanged.
    setVoiceTranscripts((prev) => {
      if (
        prev.length === entries.length &&
        prev.every(
          (p, i) => p.id === entries[i]?.id && p.text === entries[i]?.text,
        )
      ) {
        return prev;
      }
      return entries;
    });
  }, []);
  const handleCockpitEvent = useCallback((event: VoiceCockpitEvent) => {
    setVoiceEvents((prev) => {
      const idx = prev.findIndex((p) => p.id === event.id);
      if (idx === -1) return [...prev, event];
      const next = prev.slice();
      // Merge so the later "done" event (which carries no args) keeps the args
      // captured on the earlier "running" event.
      next[idx] = { ...prev[idx], ...event };
      return next;
    });
  }, []);

  // The rendered list = persisted chat messages + ephemeral voice transcript
  // lines (as plain text bubbles). Effects below still key off `messages`.
  const displayMessages = useMemo<UIMessage[]>(() => {
    if (voiceTranscripts.length === 0) return messages;
    const ephemeral = voiceTranscripts.map(
      (t): UIMessage => ({
        id: `voice-${t.id}`,
        role: t.role,
        parts: [{ type: "text", text: t.text }],
      }),
    );
    return [...messages, ...ephemeral];
  }, [messages, voiceTranscripts]);
  const isEmpty = displayMessages.length === 0;

  const {
    enabled: voiceEnabled,
    isSpeaking: voiceSpeaking,
    isPreparing: voicePreparing,
    toggle: toggleVoice,
    speak: speakReply,
    stop: stopSpeaking,
    unlock: voiceUnlock,
  } = useVoicePlayback();

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

  // Background runs persist their reply via getHistory, not the local stream.
  // When refreshed history is ahead of the seeded chat state (run finished
  // while viewing, or switched back mid-run), adopt it - but never while a
  // local stream is writing.
  useEffect(() => {
    if (isStreaming) return;
    if (initialMessages.length > messages.length) {
      setMessages(initialMessages);
    }
  }, [initialMessages, isStreaming, messages.length, setMessages]);

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

  // Speak each assistant reply aloud once it finishes streaming (voice mode on).
  // Detecting the streaming -> ready transition avoids speaking pre-existing
  // history on load; the spoken-id ref guards against re-speaking on re-render.
  const prevStatusRef = useRef(status);
  const spokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const justFinished =
      (prev === "streaming" || prev === "submitted") && status === "ready";
    if (!justFinished || !voiceEnabled) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || spokenIdRef.current === last.id) {
      return;
    }
    spokenIdRef.current = last.id;
    const text = assistantText(last.parts);
    if (text) void speakReply(text);
  }, [status, messages, voiceEnabled, speakReply]);

  const handleSend = useCallback(
    (text: string, files?: ChatFilePart[]) => {
      clearVoiceOverlay(); // typing clears the voice overlay so text chat stays clean
      stopSpeaking(); // barge-in: cut off any reply still being spoken aloud
      voiceUnlock(); // prime audio within this gesture so the reply can autoplay
      const result = sendMessage(text, files);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      return result;
    },
    [sendMessage, scrollToBottom, stopSpeaking, voiceUnlock, clearVoiceOverlay],
  );

  // Follow the live transcript down as new lines stream in (when already at the
  // bottom). `messages`-keyed scroll effects don't fire on transcript updates.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom("auto");
  }, [voiceTranscripts, scrollToBottom]);

  // Hands-free conversation loop: listens, auto-sends on a pause, and resumes
  // listening after each reply is spoken. STT pauses while thinking/speaking.
  const {
    isSupported: conversationSupported,
    phase: conversationPhase,
    active: conversationActive,
    muted: conversationMuted,
    start: startConversationLoop,
    stop: stopConversationLoop,
    toggleMute: toggleConversationMute,
  } = useVoiceConversation({
    onSend: handleSend,
    isAwaitingReply: isStreaming,
    isSpeaking: voiceSpeaking,
    isPreparing: voicePreparing,
  });

  // Real-time path: when LiveKit is configured, the call button opens a true
  // full-duplex LiveKit room (Agent A worker) instead of the browser Web Speech
  // loop. The browser loop stays as the fallback when LiveKit isn't set up.
  const liveKitConfigured = !!env.NEXT_PUBLIC_LIVEKIT_URL;
  const [liveCallActive, setLiveCallActive] = useState(false);
  const [liveCallMuted, setLiveCallMuted] = useState(false);

  const handleStartConversation = useCallback(() => {
    voiceUnlock(); // prime audio within this gesture so replies can autoplay
    if (liveKitConfigured) {
      clearVoiceOverlay(); // start each call with a fresh transcript + action feed
      setLiveCallMuted(false); // each call starts unmuted
      setTerminalOpen(true); // surface the Live pane so actions are visible
      setLiveCallActive(true);
      return;
    }
    if (!voiceEnabled) toggleVoice(); // replies must be spoken to drive the loop
    void startConversationLoop();
  }, [
    voiceUnlock,
    liveKitConfigured,
    voiceEnabled,
    toggleVoice,
    startConversationLoop,
    clearVoiceOverlay,
    setTerminalOpen,
  ]);

  const handleStopConversation = useCallback(() => {
    stopSpeaking(); // cut any reply still being spoken when the user ends the call
    clearVoiceOverlay(); // don't leave a stale transcript / action feed behind
    setLiveCallActive(false);
    stopConversationLoop();
  }, [stopSpeaking, stopConversationLoop, clearVoiceOverlay]);

  // Stable callback so memoized AssistantMessage rows don't re-render on every
  // streaming/voice tick just because this arrow was recreated.
  const handleOpenTerminal = useCallback(
    () => setTerminalOpen(true),
    [setTerminalOpen],
  );

  // Clear the overlay when a call ends — including a failed/aborted setup — so a
  // stale transcript / action feed doesn't linger into the next session.
  const handleVoiceEnded = useCallback(() => {
    clearVoiceOverlay();
    setLiveCallActive(false);
  }, [clearVoiceOverlay]);

  // Call-button state reflects either path.
  const callActive = conversationActive || liveCallActive;
  const callPhase = liveCallActive ? "listening" : conversationPhase;
  // One mute button drives whichever voice path is live: the LiveKit mic on a
  // real-time call, otherwise the browser conversation loop.
  const isMuted = liveCallActive ? liveCallMuted : conversationMuted;
  const handleToggleMute = useCallback(() => {
    if (liveCallActive) setLiveCallMuted((m) => !m);
    else toggleConversationMute();
  }, [liveCallActive, toggleConversationMute]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ComposioCta />
        <div className="relative min-h-0 flex-1">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
              <OpenClawLogo size={64} className="opacity-95" />
              <div className="space-y-1.5">
                <h2 className="font-heading text-2xl font-bold tracking-tight">
                  What can I do for you?
                </h2>
                <p className="text-muted-foreground text-sm">
                  Ask anything, or start with one of these.
                </p>
              </div>
              <div className="flex max-w-md flex-wrap justify-center gap-2">
                {SAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      void handleSend(prompt);
                    }}
                    className="border-border bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground rounded-full border px-4 py-2 text-sm transition-all hover:scale-[1.02]"
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
              {displayMessages.map((message) => (
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
                        onOpenTerminal={handleOpenTerminal}
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
          voiceEnabled={voiceEnabled}
          voiceSpeaking={voiceSpeaking}
          onToggleVoice={toggleVoice}
          conversationSupported={conversationSupported || liveKitConfigured}
          conversationActive={callActive}
          conversationPhase={callPhase}
          conversationMuted={isMuted}
          onStartConversation={handleStartConversation}
          onStopConversation={handleStopConversation}
          onToggleMute={handleToggleMute}
        />
        <VoiceCall
          active={liveCallActive}
          muted={liveCallMuted}
          onEnded={handleVoiceEnded}
          onCockpitEvent={handleCockpitEvent}
          onTranscript={handleTranscript}
        />
      </div>

      {terminalOpen && (
        <div className="border-border hidden w-[400px] shrink-0 border-l md:block lg:w-[500px]">
          <TerminalPane
            messages={messages}
            status={status}
            onHide={() => setTerminalOpen(false)}
            liveEvents={voiceEvents}
          />
        </div>
      )}
    </div>
  );
}
