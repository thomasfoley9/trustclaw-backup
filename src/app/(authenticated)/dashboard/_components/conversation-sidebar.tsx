"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Pencil,
  Check,
  X,
  Clock,
  BookmarkPlus,
} from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { formatCronExpression, formatCronDate } from "~/lib/cron-format";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { AlertDialog } from "~/components/core/confirm-dialog";
import { SaveToKnowledgeDialog } from "./save-to-knowledge-dialog";

// Mirror of the server's run-staleness window: runs older than this are
// treated as dead even if the flag wasn't cleared (crashed function).
const RUN_STALE_MS = 5 * 60 * 1000;

export function runningNow(activeRunStartedAt: string | Date | null): boolean {
  if (!activeRunStartedAt) return false;
  return Date.now() - new Date(activeRunStartedAt).getTime() < RUN_STALE_MS;
}

type View = "chats" | "cron";

// Desktop sidebar wrapper - hidden on mobile (the drawer handles small screens).
export function ConversationSidebar() {
  return (
    <aside className="border-sidebar-border bg-sidebar hidden w-64 shrink-0 flex-col border-r md:flex">
      <ConversationSidebarContent />
    </aside>
  );
}

// The shared content - rendered in the desktop aside and the mobile drawer.
export function ConversationSidebarContent({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const utils = trpc.useUtils();
  const [view, setView] = useState<View>("chats");

  const { data, error, isLoading, refetch } =
    trpc.trustclaw.getConversations.useQuery(undefined, {
      // Poll while any session has a background run so spinners and
      // completions show up without a manual refresh.
      refetchInterval: (query) =>
        query.state.data?.conversations.some((c) =>
          runningNow(c.activeRunStartedAt),
        )
          ? 4000
          : false,
    });

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
  const renameConversation = trpc.trustclaw.renameConversation.useMutation({
    onError: trpcToastOnError,
    onSuccess: refresh,
  });

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Which conversation's "save to knowledge" dialog is open
  const [savingConvId, setSavingConvId] = useState<string | null>(null);

  const beginRename = (id: string, title: string) => {
    setRenamingId(id);
    setRenameValue(title);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };
  const commitRename = async (id: string, original: string) => {
    const next = renameValue.trim();
    cancelRename();
    if (next && next !== original) {
      await renameConversation.mutateAsync({ id, title: next });
    }
  };

  const conversations = data?.conversations ?? [];
  const activeId = data?.activeConversationId;
  const busy =
    createConversation.isPending ||
    setActive.isPending ||
    deleteConversation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Chats | Cron toggle */}
      <div className="flex gap-1 p-2">
        <button
          type="button"
          onClick={() => setView("chats")}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            view === "chats"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          Chats
        </button>
        <button
          type="button"
          onClick={() => setView("cron")}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            view === "cron"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          Cron
        </button>
      </div>

      {view === "chats" ? (
        <>
          <div className="px-2 pb-2">
            <Button
              className="bg-accent-gradient w-full justify-start gap-2 border-0 text-white shadow-md transition-transform hover:scale-[1.01]"
              onClick={() => {
                void createConversation.mutateAsync();
                onNavigate?.();
              }}
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
            ) : isLoading ? (
              <ul className="space-y-1 px-1 py-1">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="px-1.5 py-2">
                    <Skeleton className="h-4 w-full" />
                  </li>
                ))}
              </ul>
            ) : conversations.length === 0 ? (
              <p className="text-muted-foreground px-2 py-4 text-xs">
                No chats yet.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((c) => {
                  const isActive = c.id === activeId;
                  const isRunning = runningNow(c.activeRunStartedAt);
                  const isRenaming = renamingId === c.id;

                  if (isRenaming) {
                    return (
                      <li
                        key={c.id}
                        className="flex items-center gap-1 rounded-md px-1 py-1"
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void commitRename(c.id, c.title);
                            if (e.key === "Escape") cancelRename();
                          }}
                          maxLength={100}
                          className="border-input bg-background min-w-0 flex-1 rounded border px-2 py-1 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void commitRename(c.id, c.title)}
                          className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                          aria-label="Save title"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={c.id}
                      className={cn(
                        "group relative flex items-center rounded-lg transition-colors",
                        isActive
                          ? "bg-primary/15 before:bg-primary before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full"
                          : "hover:bg-accent/60",
                      )}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!isActive)
                            void setActive.mutateAsync({ id: c.id });
                          onNavigate?.();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm"
                      >
                        {isRunning ? (
                          <Loader2 className="text-primary h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <MessageSquare
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-primary" : "text-muted-foreground",
                            )}
                          />
                        )}
                        <span
                          className={cn("truncate", isActive && "font-medium")}
                        >
                          {c.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSavingConvId(c.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0 px-1.5 py-2 opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Save chat to knowledge"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => beginRename(c.id, c.title)}
                        className="text-muted-foreground hover:text-foreground shrink-0 px-1.5 py-2 opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Rename chat"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <AlertDialog
                        title="Delete this chat?"
                        description="This permanently removes the conversation and its messages. This can't be undone."
                        confirmLabel="Delete"
                        onConfirm={async () => {
                          await deleteConversation.mutateAsync({ id: c.id });
                        }}
                        isPending={deleteConversation.isPending}
                        trigger={
                          <button
                            type="button"
                            disabled={busy}
                            className="text-muted-foreground hover:text-destructive shrink-0 px-1.5 py-2 opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            aria-label="Delete chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <CronList />
      )}

      {savingConvId && (
        <SaveToKnowledgeDialog
          conversationId={savingConvId}
          open={!!savingConvId}
          onOpenChange={(o) => {
            if (!o) setSavingConvId(null);
          }}
        />
      )}
    </div>
  );
}

function CronList() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage } =
    trpc.trustclaw.getCronJobs.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );
  const toggle = trpc.trustclaw.toggleCronJob.useMutation({
    onError: trpcToastOnError,
    onSuccess: () => void utils.trustclaw.getCronJobs.invalidate(),
  });

  const jobs = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="px-2 py-4">
          <p className="text-muted-foreground text-xs">
            Couldn&apos;t load scheduled jobs.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-primary mt-1 text-xs hover:underline"
          >
            Try again
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-muted-foreground px-2 py-4 text-xs">
          No scheduled jobs. Ask the agent to schedule something, or add one in
          Settings.
        </p>
      ) : (
        <ul className="space-y-1">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="border-border rounded-md border p-2 text-xs"
            >
              <p className="text-foreground line-clamp-2">{job.prompt}</p>
              <div className="text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {formatCronExpression(job.expression)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground truncate">
                  Next: {formatCronDate(job.nextRunAt)}
                </span>
                <Switch
                  checked={job.enabled}
                  disabled={toggle.isPending}
                  onCheckedChange={(enabled) =>
                    void toggle.mutateAsync({ jobId: job.id, enabled })
                  }
                  aria-label={job.enabled ? "Disable job" : "Enable job"}
                />
              </div>
              {job.lastError && (
                <p className="text-destructive mt-1 line-clamp-2">
                  {job.lastError}
                </p>
              )}
            </li>
          ))}
          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              className="text-primary w-full py-2 text-xs hover:underline"
            >
              Load more
            </button>
          )}
        </ul>
      )}
    </div>
  );
}
