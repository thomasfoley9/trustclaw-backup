"use client";

import { Ghost } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { trpcToastOnError } from "~/components/core/toast-notifications";

export function MemoryBucketControl() {
  const utils = trpc.useUtils();
  const { data } = trpc.trustclaw.getInstance.useQuery();
  const { data: bucketData } = trpc.trustclaw.getBuckets.useQuery();
  const instance = data?.instance;
  const buckets = bucketData?.buckets ?? [];

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    onError: trpcToastOnError,
    onSuccess: () => void utils.trustclaw.getInstance.invalidate(),
  });

  if (!instance) {
    return null;
  }

  const incognito = instance.incognitoMode;
  const bucket = instance.activeMemoryBucket;

  return (
    <div className="flex items-center gap-1">
      <Select
        value={bucket}
        disabled={incognito || updateSettings.isPending}
        onValueChange={(value) =>
          void updateSettings.mutateAsync({ activeMemoryBucket: value })
        }
      >
        <SelectTrigger
          className="h-9 w-[120px] sm:w-[150px]"
          aria-label="Active memory bucket"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {buckets.map((option) => (
            <SelectItem key={option.slug} value={option.slug}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          {/* A faint icon tint is far too easy to miss for a mode that
              silently disables all memory - when on, show an explicit
              labeled pill instead of a bare icon. */}
          <Button
            variant="ghost"
            size={incognito ? "sm" : "icon"}
            className={
              incognito
                ? "h-9 gap-1.5 border border-destructive/40 bg-destructive/10 px-2.5 text-destructive hover:bg-destructive/20 hover:text-destructive"
                : "h-9 w-9"
            }
            onClick={() =>
              void updateSettings.mutateAsync({ incognitoMode: !incognito })
            }
            disabled={updateSettings.isPending}
            aria-pressed={incognito}
          >
            <Ghost className="h-4 w-4" />
            {incognito && (
              <span className="text-xs font-medium">Incognito</span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {incognito
            ? "Incognito on - memory is OFF (not saving or recalling). Click to turn back on."
            : "Go incognito (no memory)"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
