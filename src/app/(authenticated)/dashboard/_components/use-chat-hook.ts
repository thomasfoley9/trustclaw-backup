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
        return { api: `/api/chat?streamId=${streamId}` };
      },
    });
  }, [streamId, conversationId]);

  const chat = useChat({
    id: "chat",
    transport,
    resume: streamId !== null,
    onFinish: () => {
      void utils.trustclaw.getHistory.invalidate();
      // Refresh the sidebar so a new session's auto-title + ordering update.
      void utils.trustclaw.getConversations.invalidate();
    },
    onError: (error) => {
      // Surface send failures (409 busy, 429 throttled, model errors) - the
      // optimistic user bubble otherwise vanishes silently on reload.
      showErrorToast(
        error?.message?.slice(0, 200) ?? "Message failed - try again",
      );
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
    // Return initialMessages until seeded to avoid flash of empty state
    messages: isSeeded ? chat.messages : initialMessages,
    status: chat.status,
    error: chat.error,
    setMessages: chat.setMessages,
  };
}
