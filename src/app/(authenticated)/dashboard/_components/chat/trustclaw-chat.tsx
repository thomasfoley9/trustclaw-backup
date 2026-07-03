"use client";

import type { UIMessage } from "@ai-sdk/react";
import { trpc } from "~/clients/trpc";
import { ErrorDisplay } from "~/components/core/error-display";
import { TrustClawChatSkeleton } from "./trustclaw-chat.skeleton";
import { ChatView } from "./chat-view";

export function TrustClawChat() {
  const conversationsQuery = trpc.trustclaw.getConversations.useQuery();
  const activeConversationId = conversationsQuery.data?.activeConversationId;

  const historyQuery = trpc.trustclaw.getHistory.useInfiniteQuery(
    { limit: 10, conversationId: activeConversationId ?? undefined },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!activeConversationId,
    },
  );

  const streamingQuery = trpc.trustclaw.getStreamingMessage.useQuery(
    { conversationId: activeConversationId ?? "" },
    {
      refetchOnWindowFocus: "always",
      enabled: !!activeConversationId,
    },
  );

  if (conversationsQuery.error || historyQuery.error || streamingQuery.error) {
    return (
      <ErrorDisplay
        message={
          conversationsQuery.error?.message ??
          historyQuery.error?.message ??
          streamingQuery.error?.message ??
          "Failed to load chat."
        }
        retryText="Try again"
        onRetry={() => {
          void conversationsQuery.refetch();
          void historyQuery.refetch();
          void streamingQuery.refetch();
        }}
      />
    );
  }

  if (
    !activeConversationId ||
    !historyQuery.data ||
    streamingQuery.isLoading
  ) {
    return <TrustClawChatSkeleton />;
  }

  const pages = historyQuery.data.pages;
  const allHistoryMessages = [...pages].reverse().flatMap((p) => p.messages);

  // Direct mapping - DB content is already UIMessage parts format.
  // Skip orphaned rows (empty content) left behind if a stream errored/aborted
  // before its assistant row was filled in - they would render as invisible
  // zero-height bubbles.
  const initialMessages: UIMessage[] = allHistoryMessages
    .filter((msg) => Array.isArray(msg.content) && msg.content.length > 0)
    .map((msg) => ({
      id: msg.id,
      role: msg.role,
      parts: msg.content as UIMessage["parts"],
    }));

  const streamId = streamingQuery.data?.messageId ?? null;

  const activeConversation = conversationsQuery.data?.conversations.find(
    (c) => c.id === activeConversationId,
  );
  const backgroundRunActive =
    !!activeConversation?.activeRunStartedAt &&
    Date.now() - new Date(activeConversation.activeRunStartedAt).getTime() <
      5 * 60 * 1000;

  return (
    <ChatView
      key={activeConversationId}
      conversationId={activeConversationId}
      backgroundRunActive={backgroundRunActive}
      initialMessages={initialMessages}
      streamId={streamId}
      historyPageCount={pages.length}
      fetchOlderMessages={() => void historyQuery.fetchNextPage()}
      hasOlderMessages={historyQuery.hasNextPage ?? false}
      isFetchingOlderMessages={historyQuery.isFetchingNextPage}
    />
  );
}
