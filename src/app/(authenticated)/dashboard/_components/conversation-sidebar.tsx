"use client";

import { Plus, Trash2, MessageSquare } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { trpcToastOnError } from "~/components/core/toast-notifications";

export function ConversationSidebar() {
  const utils = trpc.useUtils();
  const { data } = trpc.trustclaw.getConversations.useQuery();

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
        {conversations.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-xs">
            No chats yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
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
                      if (!isActive)
                        void setActive.mutateAsync({ id: c.id });
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                  >
                    <MessageSquare className="text-muted-foreground h-4 w-4 shrink-0" />
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
