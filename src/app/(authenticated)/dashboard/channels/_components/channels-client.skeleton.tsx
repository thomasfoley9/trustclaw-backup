import { Skeleton } from "~/components/ui/skeleton";

export function ChannelsClientSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
