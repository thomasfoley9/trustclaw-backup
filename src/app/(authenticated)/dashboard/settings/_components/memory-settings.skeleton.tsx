import { Skeleton } from "~/components/ui/skeleton";

// Mirrors the memory list rows while they load.
export function MemorySettingsSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="border-border flex items-start justify-between gap-2 rounded-md border p-3"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  );
}
