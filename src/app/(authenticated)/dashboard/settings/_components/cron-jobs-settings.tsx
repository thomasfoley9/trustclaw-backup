"use client";

import { CronJobsSettingsSkeleton } from "./cron-jobs-settings.skeleton";
import { useState } from "react";
import { Calendar, Clock, History, Play, Trash2 } from "lucide-react";
import { EmptyState } from "~/components/core/empty-state";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { AlertDialog } from "~/components/core/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { ErrorDisplay } from "~/components/core/error-display";
import { VirtualizedList } from "~/components/core/virtualized-list";
import { formatCronExpression, formatCronDate } from "~/lib/cron-format";
import { CronRunHistory } from "./cron-run-history";
import { Spinner } from "~/components/ui/spinner";

// Mirrors AUTO_PAUSE_THRESHOLD in ~/server/cron/run-single-job (not imported:
// that module pulls the whole server runtime into the client bundle).
const AUTO_PAUSE_THRESHOLD = 3;

export function CronJobsSettings() {
  const utils = trpc.useUtils();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.trustclaw.getCronJobs.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        // While any job is mid-run, poll so the Running badge clears and
        // nextRunAt refreshes when the run finishes.
        refetchInterval: (query) =>
          query.state.data?.pages.some((page) =>
            page.items.some((item) => item.lockedAt !== null),
          )
            ? 5000
            : false,
      },
    );

  const cronJobs = data?.pages.flatMap((page) => page.items) ?? [];

  const toggleCronJob = trpc.trustclaw.toggleCronJob.useMutation({
    // Optimistic: flip the switch immediately, roll back if the write fails.
    // Without this the toggle only moves after invalidate+refetch, which
    // reads as broken on a slow connection.
    onMutate: async ({ jobId, enabled }) => {
      await utils.trustclaw.getCronJobs.cancel();
      const prev = utils.trustclaw.getCronJobs.getInfiniteData({ limit: 20 });
      utils.trustclaw.getCronJobs.setInfiniteData({ limit: 20 }, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) =>
                  item.id === jobId ? { ...item, enabled } : item,
                ),
              })),
            }
          : old,
      );
      return { prev };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prev) {
        utils.trustclaw.getCronJobs.setInfiniteData({ limit: 20 }, ctx.prev);
      }
      trpcToastOnError(error);
    },
    onSettled: () => {
      void utils.trustclaw.getCronJobs.invalidate();
    },
  });

  const deleteCronJob = trpc.trustclaw.deleteCronJob.useMutation({
    onSuccess: () => {
      showSuccessToast("Cron job deleted");
      void utils.trustclaw.getCronJobs.invalidate();
    },
    onError: trpcToastOnError,
  });

  const runCronJobNow = trpc.trustclaw.runCronJobNow.useMutation({
    onSuccess: (_data, vars) => {
      showSuccessToast("Run started");
      // Open the history panel so the new run is visible as it progresses.
      setExpandedJobId(vars.jobId);
      void utils.trustclaw.getCronJobs.invalidate();
      void utils.trustclaw.getCronRuns.invalidate({ jobId: vars.jobId });
    },
    onError: trpcToastOnError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled Tasks</CardTitle>
        <CardDescription>
          Cron jobs that run your agent on a schedule
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <CronJobsSettingsSkeleton />
        ) : error ? (
          <ErrorDisplay
            message="Failed to load scheduled tasks"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        ) : cronJobs.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No scheduled tasks"
            description="Ask your agent to schedule something!"
          />
        ) : (
          <VirtualizedList
            items={cronJobs}
            renderItem={(job) => {
              const isRunning = job.lockedAt !== null;
              const isAutoPaused =
                !job.enabled && job.consecutiveFailures >= AUTO_PAUSE_THRESHOLD;
              const isStartingRun =
                runCronJobNow.isPending &&
                runCronJobNow.variables?.jobId === job.id;
              const isExpanded = expandedJobId === job.id;

              return (
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{job.prompt}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatCronExpression(job.expression)}
                        </span>
                        {job.nextRunAt && (
                          <span>
                            Next: {formatCronDate(job.nextRunAt)} (
                            {job.timezone ?? "UTC"})
                          </span>
                        )}
                        {isRunning && (
                          <Badge variant="secondary" className="gap-1">
                            <Spinner size="sm" />
                            Running
                          </Badge>
                        )}
                        {isAutoPaused ? (
                          <Badge variant="destructive">Auto-paused</Badge>
                        ) : !job.enabled ? (
                          <Badge variant="secondary">Paused</Badge>
                        ) : job.lastError ? (
                          <Badge variant="destructive">
                            Failing ({job.consecutiveFailures})
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Run now"
                        title="Run now"
                        disabled={isRunning || isStartingRun}
                        onClick={() =>
                          void runCronJobNow.mutateAsync({ jobId: job.id })
                        }
                      >
                        {isStartingRun ? (
                          <Spinner />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={
                          isExpanded ? "Hide run history" : "Show run history"
                        }
                        title="Run history"
                        aria-expanded={isExpanded}
                        className={isExpanded ? "bg-accent" : undefined}
                        onClick={() =>
                          setExpandedJobId(isExpanded ? null : job.id)
                        }
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={job.enabled}
                        // Guard the race: a second flip while the first write
                        // is in flight would clobber the optimistic state.
                        disabled={toggleCronJob.isPending}
                        aria-label={job.enabled ? "Disable schedule" : "Enable schedule"}
                        onCheckedChange={(checked) =>
                          void toggleCronJob.mutateAsync({
                            jobId: job.id,
                            enabled: checked,
                          })
                        }
                      />
                      <AlertDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete cron job"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteCronJob.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete Cron Job"
                        description={`This will permanently delete the scheduled task: "${job.prompt}"`}
                        confirmLabel="Delete"
                        onConfirm={() => void deleteCronJob.mutateAsync({ jobId: job.id })}
                        isPending={deleteCronJob.isPending}
                      />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border pt-3">
                      <CronRunHistory jobId={job.id} />
                    </div>
                  )}
                </div>
              );
            }}
            estimateSize={100}
            className="max-h-64 md:max-h-96"
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                void fetchNextPage();
              }
            }}
            footer={
              isFetchingNextPage ? (
                <div className="flex justify-center py-4">
                  <Spinner className="size-5 text-muted-foreground" />
                </div>
              ) : null
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
