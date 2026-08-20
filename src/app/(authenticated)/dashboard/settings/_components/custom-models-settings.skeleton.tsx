import { Skeleton } from "~/components/ui/skeleton";

// Mirrors the custom model list rows while they load.
export function CustomModelsSettingsSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1].map((i) => (
        <li
          key={i}
          className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  );
}
