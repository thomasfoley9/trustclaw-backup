import { Skeleton } from "~/components/ui/skeleton";

// Mirrors the scheduled task rows while they load.
export function CronJobsSettingsSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="border-border flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-full max-w-sm" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
