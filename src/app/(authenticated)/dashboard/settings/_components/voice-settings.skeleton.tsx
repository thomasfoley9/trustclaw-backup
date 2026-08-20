import { Skeleton } from "~/components/ui/skeleton";

// Mirrors the voice card content (key row, voice picker, speed buttons)
// while the settings load.
export function VoiceSettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full rounded-md" />
      <div className="space-y-4 border-t pt-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-14 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
