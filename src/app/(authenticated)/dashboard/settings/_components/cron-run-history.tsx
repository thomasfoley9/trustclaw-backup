"use client";

import dayjs from "~/lib/dayjs";
import { AlertCircle, CheckCircle2, History } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { EmptyState } from "~/components/core/empty-state";

function runDuration(startedAt: Date, finishedAt: Date | null): string | null {
  if (!finishedAt) return null;
  const seconds = Math.max(0, dayjs(finishedAt).diff(startedAt, "seconds"));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function CronRunHistory({ jobId }: { jobId: string }) {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.trustclaw.getCronRuns.useInfiniteQuery(
    { jobId, limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnMount: "always",
      // An in-flight run flips to succeeded/failed without user action; the
      // panel only mounts while expanded, so polling stays cheap.
      refetchInterval: 5000,
    },
  );

  const runs = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Spinner className="text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-3 text-center text-xs text-muted-foreground">
        Could not load run history.
      </p>
    );
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No runs yet"
        description="Use Run now to test this task."
        className="py-4"
      />
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const duration = runDuration(run.startedAt, run.finishedAt);
        return (
          <div
            key={run.id}
            className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2"
          >
            {run.status === "running" ? (
              <Spinner className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            ) : run.status === "succeeded" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-medium">
                  {run.status === "running"
                    ? "Running"
                    : run.status === "succeeded"
                      ? "Succeeded"
                      : "Failed"}
                </span>
                <span
                  className="text-muted-foreground"
                  title={dayjs(run.startedAt).format("MMM D, YYYY h:mm:ss A")}
                >
                  {dayjs(run.startedAt).fromNow()}
                </span>
                {duration && (
                  <span className="text-muted-foreground">in {duration}</span>
                )}
                {run.trigger === "manual" && (
                  <Badge variant="outline" className="h-4 px-1.5 text-2xs">
                    Manual
                  </Badge>
                )}
              </div>
              {run.error ? (
                <p className="line-clamp-2 break-words text-xs text-destructive">
                  {run.error}
                </p>
              ) : run.resultText ? (
                <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                  {run.resultText}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? (
            <Spinner className="size-3.5" />
          ) : (
            "Show older runs"
          )}
        </Button>
      )}
    </div>
  );
}
