import { Skeleton } from "~/components/ui/skeleton";

// Mirrors the key status row while it loads, so the card doesn't flash the
// "no key yet" input before the fetch resolves.
export function ComposioApiKeySettingsSkeleton() {
  return (
    <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex shrink-0 gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}
