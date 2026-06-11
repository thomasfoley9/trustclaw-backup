"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { trpcToastOnError } from "~/components/core/toast-notifications";

// Mirror of the server's run-staleness window: runs older than this are
// treated as dead even if the flag wasn't cleared (crashed function).
const RUN_STALE_MS = 5 * 60 * 1000;

export function runningNow(activeRunStartedAt: string | Date | null): boolean {
  if (!activeRunStartedAt) return false;
  return Date.now() - new Date(activeRunStartedAt).getTime() < RUN_STALE_MS;
}

export function ConversationSidebar() {
  const utils = trpc.useUtils();
  const { data, error, refetch } = trpc.trustclaw.getConversations.useQuery(
    undefined,
    {
      // Poll while any session has a background run so spinners and
      // completions show up without a manual refresh.
      refetchInterval: (query) =>
        query.state.data?.conversations.some((c) =>
          runningNow(c.activeRunStartedAt),
        )
          ? 4000
          : false,
    },
  );

  // When a background run finishes, pull its result into the chat history.
  const prevRunningRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const running = new Set(
      (data?.conversations ?? [])
        .filter((c) => runningNow(c.activeRunStartedAt))
        .map((c) => c.id),
    );
    for (const id of prevRunningRef.current) {
      if (!running.has(id)) {
        void utils.trustclaw.getHistory.invalidate();
      }
    }
    prevRunningRef.current = running;
  }, [data, utils]);

  const refresh = () => {
    void utils.trustclaw.getConversations.invalidate();
    void utils.trustclaw.getInstance.invalidate();
  };

  const createConversation = trpc.trustclaw.createConversation.useMutation({
    onError: trpcToastOnError,
    onSuccess: refresh,
  });
  const setActive = trpc.trustclaw.setActiveConversation.useMutation({
    onError: trpcToastOnError,
    onSuccess: refresh,
  });
  const deleteConversation = trpc.trustclaw.deleteConversation.useMutation({
    onError: trpcToastOnError,
    onSuccess: refresh,
  });

  const conversations = data?.conversations ?? [];
  const activeId = data?.activeConversationId;
  const busy =
    createConversation.isPending ||
    setActive.isPending ||
    deleteConversation.isPending;

  return (
    <aside className="border-border hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="p-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => void createConversation.mutateAsync()}
          disabled={createConversation.isPending}
        >
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {error ? (
          <div className="px-2 py-4">
            <p className="text-muted-foreground text-xs">
              Couldn&apos;t load chats.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-primary mt-1 text-xs hover:underline"
            >
              Try again
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-xs">
            No chats yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              const isRunning = runningNow(c.activeRunStartedAt);
              return (
                <li
                  key={c.id}
                  className={`group flex items-center rounded-md ${
                    isActive ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!isActive) void setActive.mutateAsync({ id: c.id });
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                  >
                    {isRunning ? (
                      <Loader2 className="text-primary h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <MessageSquare className="text-muted-foreground h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void deleteConversation.mutateAsync({ id: c.id })
                    }
                    className="text-muted-foreground hover:text-destructive shrink-0 px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
