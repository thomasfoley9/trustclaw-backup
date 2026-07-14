"use client";

import { useState } from "react";

import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { Spinner } from "~/components/ui/spinner";

export function SaveToKnowledgeDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, refetch } = trpc.trustclaw.getBuckets.useQuery();
  const buckets = data?.buckets ?? [];
  const [bucketSlug, setBucketSlug] = useState("");
  const effectiveSlug = bucketSlug !== "" ? bucketSlug : (buckets[0]?.slug ?? "");

  const save = trpc.trustclaw.saveConversationToBucket.useMutation({
    onSuccess: (res) => {
      showSuccessToast(
        res.savedCount > 0
          ? `Saved ${res.savedCount} ${res.savedCount === 1 ? "memory" : "memories"}`
          : "Nothing durable to save from this chat",
      );
      onOpenChange(false);
    },
    onError: trpcToastOnError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save chat to knowledge</DialogTitle>
          <DialogDescription>
            Distills this conversation into durable memories stored in the
            bucket you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Bucket</Label>
          {error ? (
            // A failed fetch would otherwise render an empty picker that looks
            // like "you have no buckets" - surface it and offer a retry.
            <div className="flex items-center gap-2 text-sm">
              <span className="text-destructive">
                Couldn&apos;t load your buckets.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Select value={effectiveSlug} onValueChange={setBucketSlug}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a bucket" />
              </SelectTrigger>
              <SelectContent>
                {buckets.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            disabled={!effectiveSlug || save.isPending}
            onClick={() =>
              void save.mutateAsync({ conversationId, bucketSlug: effectiveSlug })
            }
          >
            {save.isPending ? (
              <>
                <Spinner className="mr-2" /> Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
