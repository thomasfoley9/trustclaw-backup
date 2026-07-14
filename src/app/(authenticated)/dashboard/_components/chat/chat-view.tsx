"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import type { UIMessage } from "@ai-sdk/react";
import { ArrowDown, ChevronUp, RefreshCw } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { ErrorBoundary } from "~/components/core/error-boundary";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { useIsMobile } from "~/lib/use-is-mobile";
import { usePersistedPanelLayout } from "~/lib/use-persisted-panel-layout";
import { useTerminalStore } from "../terminal-store";
import { useChatHook, type ChatFilePart } from "../use-chat-hook";
import { useVoiceCallStore } from "./voice-call-store";
import { UserMessage } from "./user-message";
import { AssistantMessage } from "./assistant-message/assistant-message";
import { ThinkingIndicator } from "./assistant-message/thinking-indicator";
import { ChatInput } from "./chat-input";
import { useVoicePlayback } from "./use-voice-playback";
import { useVoiceConversation } from "./use-voice-conversation";
import type {
  VoiceCockpitEvent,
  VoiceTranscriptEntry,
} from "./voice-call";
import type { AgentState } from "@livekit/components-react";
import { env } from "~/env";
import { TerminalPane } from "../terminal/terminal-pane";
import { OpenClawLogo } from "~/app/_components/openclaw-logo";
import { Spinner } from "~/components/ui/spinner";

// Code-split the LiveKit stack (livekit-client + @livekit/components-react is
// >1MB of client JS): the chunk loads on the first call, not on every
// /dashboard visit. Types above stay as `import type` (erased at build time).
const VoiceCall = dynamic(
  () => import("./voice-call").then((m) => m.VoiceCall),
  { ssr: false },
);

// Starter prompts keyed by connected toolkit; anything not connected falls
// back to prompts that work with zero integrations.
const TOOLKIT_PROMPTS: Record<string, string> = {
  gmail: "Summarize my emails from today",
  googlecalendar: "What's on my calendar tomorrow?",
  slack: "Catch me up on Slack",
  github: "What's new in my GitHub notifications?",
  notion: "Find my most recent Notion notes",
  linear: "Which Linear issues are assigned to me?",
};

const FALLBACK_PROMPTS = [
  "What can you do?",
  "Remember that I prefer short, direct answers",
  "Set up a daily 8am summary of my day",
];

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 120;

// Windowed rendering: only the newest MESSAGE_WINDOW messages are mounted by
// default; "Show earlier messages" reveals more in window-sized steps. Bounds
// the DOM (and per-token reconciliation) in marathon sessions instead of
// rendering every message ever streamed.
const MESSAGE_WINDOW = 75;

// Plain text of an assistant message (text parts only - tool calls/results are
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
  const { sendMessage, stop, regenerate, messages, status, error, setMessages } =
    useChatHook({
      initialMessages,
      streamId,
      conversationId,
    });
  const terminalOpen = useTerminalStore((s) => s.terminalOpen);
  const setTerminalOpen = useTerminalStore((s) => s.setTerminalOpen);

  // Live voice-call overlay: ephemeral transcript lines + Agent B tool events
  // arriving over the LiveKit data channel during a call. Display-only - the
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

  // Render window over the tail of the list (ephemeral voice lines live at the
  // tail, so they are always inside the window).
  const [visibleCount, setVisibleCount] = useState(MESSAGE_WINDOW);
  const visibleMessages = useMemo(
    () =>
      displayMessages.length > visibleCount
        ? displayMessages.slice(displayMessages.length - visibleCount)
        : displayMessages,
    [displayMessages, visibleCount],
  );
  const hiddenCount = displayMessages.length - visibleMessages.length;

  // Starter prompts derived from what's actually connected; a user with no
  // integrations gets prompts that work without any. A failed fetch (e.g. no
  // Composio key yet) just means the fallback list.
  const toolkitsQuery = trpc.toolkits.getToolkits.useQuery(
    { isConnected: true, limit: 50 },
    { enabled: isEmpty, retry: false, staleTime: 5 * 60 * 1000 },
  );
  const samplePrompts = useMemo(() => {
    const connected = toolkitsQuery.data?.items ?? [];
    const derived = connected
      .map((t) => TOOLKIT_PROMPTS[t.slug])
      .filter((p): p is string => !!p);
    return [...derived, ...FALLBACK_PROMPTS].slice(0, 3);
  }, [toolkitsQuery.data]);

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

  // Screen-reader announcements for streaming: announcing every token would
  // be noise, so a visually-hidden polite live region announces only the
  // state transitions (reply started / finished / failed).
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const announceStatusRef = useRef(status);
  useEffect(() => {
    const prev = announceStatusRef.current;
    announceStatusRef.current = status;
    if (prev === status) return;
    if (
      (status === "submitted" || status === "streaming") &&
      prev !== "submitted" &&
      prev !== "streaming"
    ) {
      setLiveAnnouncement("Assistant is replying");
    } else if (
      (prev === "submitted" || prev === "streaming") &&
      status === "ready"
    ) {
      setLiveAnnouncement("Reply finished");
    } else if (status === "error") {
      setLiveAnnouncement("Response failed");
    }
  }, [status]);

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

  // Latest messages without making effects below re-run per streaming tick.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Prepend older history pages, preserving the visual scroll position so the
  // viewport doesn't jump when older messages load in above.
  const pageCountRef = useRef(historyPageCount);
  const prependAnchorRef = useRef<number | null>(null);
  useEffect(() => {
    if (historyPageCount <= pageCountRef.current) {
      pageCountRef.current = historyPageCount;
      return;
    }
    pageCountRef.current = historyPageCount;
    // Anchor (and grow the render window) only when the new page actually
    // adds rows - a stale anchor would suppress bottom-pinning and later
    // restore an outdated scroll position.
    const knownIds = new Set(messagesRef.current.map((m) => m.id));
    const prependedCount = initialMessages.filter(
      (m) => !knownIds.has(m.id),
    ).length;
    if (prependedCount === 0) return;
    const el = scrollRef.current;
    prependAnchorRef.current = el ? el.scrollHeight - el.scrollTop : null;
    // Freshly fetched pages must not land hidden behind the render window.
    setVisibleCount((c) => c + prependedCount);
    setMessages((current) => {
      const currentIds = new Set(current.map((m) => m.id));
      const newOlder = initialMessages.filter((m) => !currentIds.has(m.id));
      if (newOlder.length === 0) return current;
      return [...newOlder, ...current];
    });
  }, [historyPageCount, initialMessages, setMessages]);

  // Restore scroll position right after a prepend / window expansion (before
  // paint). Keyed on the rendered list, NOT dependency-free: an empty array of
  // deps here previously forced a synchronous scrollHeight read (layout flush)
  // on every render, including every streaming token.
  useLayoutEffect(() => {
    if (prependAnchorRef.current != null && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
    }
  }, [visibleMessages]);

  // Background runs persist their reply via getHistory, not the local stream.
  // When refreshed history is ahead of the seeded chat state (run finished
  // while viewing, or switched back mid-run), adopt it - but never while a
  // local stream is writing. "Ahead" is decided by the newest row's id, not
  // list lengths: a new reply can push the oldest row out of the page window
  // (same length, different content), which a length compare never adopts -
  // the reply then simply never appears. A stale refetch can't fire this: its
  // newest id is already in the local list.
  useEffect(() => {
    if (isStreaming) return;
    const lastInitial = initialMessages[initialMessages.length - 1];
    if (!lastInitial) return;
    const hasNewestRow = messages.some((m) => m.id === lastInitial.id);
    if (!hasNewestRow || initialMessages.length > messages.length) {
      // Never adopt an EMPTY assistant tail over locally streamed content: a
      // stopped run leaves its pre-created assistant row unfilled, and
      // adopting it would visibly wipe the partial reply the user kept.
      const lastLocal = messages[messages.length - 1];
      const incomingEmpty =
        lastInitial.role === "assistant" &&
        !lastInitial.parts.some(
          (p) =>
            (p.type === "text" && p.text.trim().length > 0) ||
            p.type.startsWith("tool-") ||
            p.type === "dynamic-tool",
        );
      const localHasContent =
        lastLocal?.role === "assistant" &&
        lastLocal.parts.some(
          (p) => p.type === "text" && p.text.trim().length > 0,
        );
      if (incomingEmpty && localHasContent) return;
      // Merge, don't replace: the server page holds only the newest N rows, so
      // wholesale adoption truncates locally-known older messages (they
      // silently vanish after every turn once the conversation outgrows a
      // page). Keep the local prefix that predates the server window; from the
      // first shared id onward the server page is the truth (this also dedups
      // optimistic client-side rows against their persisted versions).
      setMessages((current) => {
        const serverIds = new Set(initialMessages.map((m) => m.id));
        const firstSharedIdx = current.findIndex((m) => serverIds.has(m.id));
        const olderLocal =
          firstSharedIdx <= 0 ? [] : current.slice(0, firstSharedIdx);
        return [...olderLocal, ...initialMessages];
      });
    }
  }, [initialMessages, isStreaming, messages, setMessages]);

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
    // Fetch older server pages only once every locally-known message is
    // visible - while rows are still hidden behind the render window, the
    // "Show earlier messages" button is the path backwards.
    if (
      el.scrollTop < NEAR_TOP_PX &&
      hiddenCount === 0 &&
      hasOlderMessages &&
      !isFetchingOlderMessages
    ) {
      fetchOlderMessages();
    }
  }, [hiddenCount, hasOlderMessages, isFetchingOlderMessages, fetchOlderMessages]);

  // Reveal another window of already-loaded messages, keeping the viewport
  // anchored so the list doesn't jump (same mechanism as the prepend restore).
  const handleShowEarlier = useCallback(() => {
    const el = scrollRef.current;
    prependAnchorRef.current = el ? el.scrollHeight - el.scrollTop : null;
    setVisibleCount((c) => c + MESSAGE_WINDOW);
  }, []);

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
  // The agent's live lifecycle state (listening/thinking/speaking), reported
  // by VoiceCall - drives a truthful status pill during a real call.
  const [agentState, setAgentState] = useState<AgentState | null>(null);

  // Mirror the call state into the shared store so the conversation sidebar
  // (a different subtree) can warn when a chat switch will end the call.
  // The cleanup covers the remount-on-switch path, where this view unmounts
  // while the flag is still true.
  const setSharedCallActive = useVoiceCallStore((s) => s.setLiveCallActive);
  useEffect(() => {
    setSharedCallActive(liveCallActive);
    return () => setSharedCallActive(false);
  }, [liveCallActive, setSharedCallActive]);
  // Mount latch for the code-split VoiceCall: it must be mounted to react to
  // `active` flipping true, but mounting it eagerly would fetch the LiveKit
  // chunk on every dashboard load. Latched on the first call and kept mounted
  // afterwards so end-of-call teardown effects run normally.
  const [hasEverCalled, setHasEverCalled] = useState(false);

  const handleStartConversation = useCallback(() => {
    voiceUnlock(); // prime audio within this gesture so replies can autoplay
    if (liveKitConfigured) {
      // Re-entry guard: a live call is already up (or mid-connect, since
      // liveCallActive flips true synchronously here). Without this, a second
      // trigger would mint a new token + dispatch a second agent - the
      // duplicate-session bug. Toggling OFF goes through onStopConversation.
      if (liveCallActive) return;
      clearVoiceOverlay(); // start each call with a fresh transcript + action feed
      setAgentState(null); // no stale phase from a previous call
      setLiveCallMuted(false); // each call starts unmuted
      setTerminalOpen(true); // surface the Live pane so actions are visible
      setHasEverCalled(true); // mount the code-split VoiceCall (no-op after the first call)
      setLiveCallActive(true);
      return;
    }
    if (!voiceEnabled) toggleVoice(); // replies must be spoken to drive the loop
    void startConversationLoop();
  }, [
    voiceUnlock,
    liveKitConfigured,
    liveCallActive,
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
    setAgentState(null);
    stopConversationLoop();
  }, [stopSpeaking, stopConversationLoop, clearVoiceOverlay]);

  // Mobile has no room for the side pane, so tool chips (and the navbar
  // toggle) open a bottom Sheet instead. Its own store flag (defaults closed,
  // never persisted) so the desktop pane's default-open never auto-pops the
  // sheet on a phone. Lives in the terminal store so the navbar can drive it.
  const isMobile = useIsMobile();
  const {
    groupRef: panelGroupRef,
    onLayoutChanged: onPanelLayoutChanged,
    applyStoredLayout,
  } = usePersistedPanelLayout("trustclaw-panels-chat");
  const mobileTerminalOpen = useTerminalStore((s) => s.mobileTerminalOpen);
  const setMobileTerminalOpen = useTerminalStore(
    (s) => s.setMobileTerminalOpen,
  );

  // Stable callback so memoized AssistantMessage rows don't re-render on every
  // streaming/voice tick just because this arrow was recreated. Opens the
  // desktop pane and, on mobile, the Sheet.
  const handleOpenTerminal = useCallback(() => {
    // Only latch the state for the surface actually in use - setting the
    // mobile sheet flag on desktop makes it pop open uninvited when the
    // viewport later crosses below md (e.g. tablet rotation).
    if (isMobile) setMobileTerminalOpen(true);
    else setTerminalOpen(true);
  }, [isMobile, setTerminalOpen, setMobileTerminalOpen]);

  // Reopening the cockpit remounts its panel with the DEFAULT width - the
  // mount-time layout apply ran while the panel was absent and its share was
  // dropped. Re-apply the stored layout once the panel has registered.
  useEffect(() => {
    if (!terminalOpen) return;
    const timer = setTimeout(() => applyStoredLayout(), 0);
    return () => clearTimeout(timer);
  }, [terminalOpen, applyStoredLayout]);

  // Clear the overlay when a call ends - including a failed/aborted setup - so a
  // stale transcript / action feed doesn't linger into the next session.
  const handleVoiceEnded = useCallback(() => {
    clearVoiceOverlay();
    setLiveCallActive(false);
    setAgentState(null);
  }, [clearVoiceOverlay]);

  // Call-button state reflects either path. A muted live call must not read
  // "Listening" - the mic is off. For LiveKit calls the phase comes from the
  // agent's real state (plus running Agent B tools, which count as thinking)
  // instead of a hardcoded "listening".
  const callActive = conversationActive || liveCallActive;
  const voiceToolsRunning = voiceEvents.some((e) => e.status === "running");
  const callPhase = liveCallActive
    ? liveCallMuted
      ? "muted"
      : agentState === "speaking"
        ? "speaking"
        : agentState === "thinking" ||
            agentState === "connecting" ||
            agentState === "initializing" ||
            voiceToolsRunning
          ? "thinking"
          : "listening"
    : conversationPhase;
  // One mute button drives whichever voice path is live: the LiveKit mic on a
  // real-time call, otherwise the browser conversation loop.
  const isMuted = liveCallActive ? liveCallMuted : conversationMuted;
  const handleToggleMute = useCallback(() => {
    if (liveCallActive) setLiveCallMuted((m) => !m);
    else toggleConversationMute();
  }, [liveCallActive, toggleConversationMute]);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      groupRef={panelGroupRef}
      onLayoutChanged={onPanelLayoutChanged}
      className="h-full overflow-hidden"
    >
      <ResizablePanel id="conversation" className="min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div aria-live="polite" role="status" className="sr-only">
          {liveAnnouncement}
        </div>
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
                {samplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      void handleSend(prompt);
                    }}
                    className="border-border bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-ring/50 focus-visible:border-ring rounded-full border px-4 py-2 text-sm transition-all duration-base ease-out-quad outline-none hover:-translate-y-px hover:shadow-sm focus-visible:ring-[3px]"
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
              {hiddenCount > 0 && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShowEarlier}
                  >
                    <ChevronUp className="size-3.5" />
                    Show earlier messages ({hiddenCount})
                  </Button>
                </div>
              )}
              {isFetchingOlderMessages && (
                <div className="flex justify-center py-3">
                  <Spinner className="text-muted-foreground" />
                </div>
              )}
              {visibleMessages.map((message) => (
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
                        onRegenerate={
                          message.id === lastMessage?.id && !isStreaming
                            ? regenerate
                            : undefined
                        }
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
              aria-label="Scroll to latest"
              className="absolute bottom-4 left-1/2 size-10 -translate-x-1/2 rounded-full shadow-md"
            >
              <ArrowDown className="size-4" />
            </Button>
          )}
        </div>

        {error && !isStreaming && (
          <div className="border-destructive/30 bg-destructive/10 mx-auto mb-2 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border px-4 py-2.5">
            <p className="text-destructive min-w-0 truncate text-sm">
              The response failed. Your message is still here - retry it.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={regenerate}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}
        <ChatInput
          onSend={handleSend}
          onStop={stop}
          status={status}
          conversationId={conversationId}
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
        {hasEverCalled && (
          <VoiceCall
            active={liveCallActive}
            muted={liveCallMuted}
            onEnded={handleVoiceEnded}
            onCockpitEvent={handleCockpitEvent}
            onTranscript={handleTranscript}
            onAgentStateChange={setAgentState}
          />
        )}
        </div>
      </ResizablePanel>

      {terminalOpen && (
        <>
          <ResizableHandle className="hidden md:flex" />
          <ResizablePanel
            id="terminal"
            defaultSize="440px"
            minSize="300px"
            maxSize="60%"
            // Keep the cockpit's PIXEL width across window resizes (the
            // percentage default ratchets it to its clamps).
            groupResizeBehavior="preserve-pixel-size"
            // className lands on the panel's INNER div (border still works
            // there); mobile hiding needs data-mobile-hidden on the outer
            // element (see globals.css).
            className="border-border border-l"
            data-mobile-hidden=""
          >
            <TerminalPane
              messages={messages}
              status={status}
              onHide={() => setTerminalOpen(false)}
              liveEvents={voiceEvents}
            />
          </ResizablePanel>
        </>
      )}

      {isMobile && (
        <Sheet open={mobileTerminalOpen} onOpenChange={setMobileTerminalOpen}>
          <SheetContent
            side="bottom"
            className="h-[80dvh] p-0 pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Activity</SheetTitle>
            </SheetHeader>
            <TerminalPane
              messages={messages}
              status={status}
              onHide={() => setMobileTerminalOpen(false)}
              liveEvents={voiceEvents}
            />
          </SheetContent>
        </Sheet>
      )}
    </ResizablePanelGroup>
  );
}
