"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { trpc } from "~/clients/trpc";
import { showErrorToast } from "~/components/core/toast-notifications";

export type ChatFilePart = {
  type: "file";
  mediaType: string;
  url: string;
  filename: string;
};

export function useChatHook({ initialMessages, streamId, conversationId }: {
  initialMessages: UIMessage[];
  streamId: string | null;
  conversationId: string;
}) {
  const utils = trpc.useUtils();
  const seededRef = useRef(false);
  const [isSeeded, setIsSeeded] = useState(false);

  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
      // Pin every send to the session this view is showing, so a sidebar
      // switch elsewhere can't reroute an in-flight message.
      body: { conversationId },
      prepareReconnectToStreamRequest: () => {
        return {
          api: `/api/chat?streamId=${streamId}&conversationId=${conversationId}`,
        };
      },
    });
  }, [streamId, conversationId]);

  // Resume is a MOUNT decision: flipping it true mid-run (a focus refetch
  // returning the streamId while the local POST stream is live) started a
  // second concurrent reader replaying the same chunks into the message list.
  const resumeOnMountRef = useRef(streamId !== null);

  const chat = useChat({
    // Per-conversation id so each chat has its own client store. With a shared
    // id, a run streaming in one chat marks ALL chats as "streaming" and blocks
    // their inputs - so you couldn't start a second job while one was running.
    id: `chat-${conversationId}`,
    transport,
    resume: resumeOnMountRef.current,
    onFinish: () => {
      void utils.trustclaw.getHistory.invalidate();
      // Refresh the sidebar so a new session's auto-title + ordering update.
      void utils.trustclaw.getConversations.invalidate();
      // Drop the finished run's resume pointer from the cache so a
      // conversation switch doesn't try to resume a dead stream.
      void utils.trustclaw.getStreamingMessage.invalidate();
    },
    onError: (error) => {
      // Surface send failures (409 busy, 429 throttled, model errors) - the
      // optimistic user bubble otherwise vanishes silently on reload. Map the
      // common statuses to plain sentences; fall back to the raw text.
      const raw = error?.message ?? "";
      let message = raw.slice(0, 200) || "Message failed - try again";
      if (/still answering|409/i.test(raw)) {
        message = "This chat is still answering - wait for it to finish.";
      } else if (/too many|rate|429/i.test(raw)) {
        message = "You're sending messages too fast - give it a moment.";
      } else if (/api key|precondition/i.test(raw)) {
        message = "Add your Anthropic API key in Settings to start chatting.";
      }
      showErrorToast(message);
      void utils.trustclaw.getHistory.invalidate();
    },
  });

  // Seed initial messages once on mount. Never pass `messages` as a controlled
  // prop to useChat - it resets internal state on every render, which causes a
  // scroll loop when combined with Virtuoso's followOutput during streaming.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (initialMessages.length > 0) {
      chat.setMessages(initialMessages);
    }
    setIsSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once on mount only
  }, []);

  const sendMessageRef = useRef(chat.sendMessage);
  sendMessageRef.current = chat.sendMessage;

  const sendMessage = useCallback(
    (text: string, files?: ChatFilePart[]) => {
      void sendMessageRef.current(
        files && files.length > 0 ? { text, files } : { text },
      );
    },
    [],
  );

  const regenerateRef = useRef(chat.regenerate);
  regenerateRef.current = chat.regenerate;
  const clearErrorRef = useRef(chat.clearError);
  clearErrorRef.current = chat.clearError;

  // Re-run the last user turn. The server sees trigger:"regenerate-message"
  // and replaces the old reply instead of stacking a duplicate turn.
  const regenerate = useCallback(() => {
    clearErrorRef.current();
    void regenerateRef.current();
  }, []);

  const stopRef = useRef(chat.stop);
  stopRef.current = chat.stop;

  const stableStop = useCallback(() => {
    // Stop the local stream view AND the server-side background run (runs
    // keep executing after a disconnect by design, so stopping requires an
    // explicit server call).
    void stopRef.current();
    void fetch("/api/chat/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }).catch(() => undefined);
  }, [conversationId]);

  return {
    sendMessage,
    stop: stableStop,
    regenerate,
    // Return initialMessages until seeded to avoid flash of empty state
    messages: isSeeded ? chat.messages : initialMessages,
    status: chat.status,
    error: chat.error,
    setMessages: chat.setMessages,
  };
}
