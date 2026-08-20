import { Skeleton } from "~/components/ui/skeleton";

// Mirrors the bucket list rows while they load.
export function KnowledgeBucketsSettingsSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1].map((i) => (
        <li
          key={i}
          className="border-border flex items-center justify-between gap-3 rounded-md border p-3"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex shrink-0 gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
