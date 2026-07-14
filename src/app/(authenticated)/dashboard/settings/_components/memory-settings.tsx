"use client";

import { MemorySettingsSkeleton } from "./memory-settings.skeleton";
import { Brain, Trash2 } from "lucide-react";
import { EmptyState } from "~/components/core/empty-state";
import moment from "moment";
import { trpc } from "~/clients/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { ErrorDisplay } from "~/components/core/error-display";
import { AlertDialog } from "~/components/core/confirm-dialog";
import { Spinner } from "~/components/ui/spinner";

export function MemorySettings() {
  const utils = trpc.useUtils();
  const {
    data,
    isLoading,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.trustclaw.getMemories.useInfiniteQuery(
    { limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const memories = data?.pages.flatMap((page) => page.items) ?? [];

  const deleteMemory = trpc.trustclaw.deleteMemory.useMutation({
    onSuccess: () => void utils.trustclaw.getMemories.invalidate(),
    onError: trpcToastOnError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <CardDescription>
          Things your agent has remembered across conversations. Delete any you
          don&apos;t want it to keep.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <MemorySettingsSkeleton />
        ) : error ? (
          <ErrorDisplay
            message="Failed to load memories"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        ) : memories.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No memories yet"
            description="Your agent will remember things as you chat."
          />
        ) : (
          <>
            <ul className="space-y-2">
              {memories.map((memory) => (
                <li
                  key={memory.id}
                  className="border-border bg-card flex items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-foreground text-sm">{memory.content}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {memory.category}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {moment(memory.createdAt).fromNow()}
                      </span>
                    </div>
                  </div>
                  <AlertDialog
                    title="Delete this memory?"
                    description={`"${memory.content.length > 120 ? `${memory.content.slice(0, 120)}...` : memory.content}" will be permanently forgotten. This can't be undone.`}
                    confirmLabel="Delete"
                    onConfirm={async () => {
                      await deleteMemory.mutateAsync({ id: memory.id });
                    }}
                    isPending={deleteMemory.isPending}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                        disabled={deleteMemory.isPending}
                        aria-label="Delete memory"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
            {hasNextPage && (
              <div className="flex justify-center pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Spinner className="mr-2" />
                      Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
