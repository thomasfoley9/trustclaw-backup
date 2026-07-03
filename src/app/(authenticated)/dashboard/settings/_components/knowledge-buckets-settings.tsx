"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, FolderTree } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Skeleton } from "~/components/ui/skeleton";
import {
  showSuccessToast,
  showTrpcErrorToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import type { RouterOutputs } from "~/clients/trpc";

type Bucket = RouterOutputs["trustclaw"]["getBuckets"]["buckets"][number];

const DEFAULT_SLUG = "general";

export function KnowledgeBucketsSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getBuckets.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bucket | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [alwaysInject, setAlwaysInject] = useState(false);

  const invalidate = () => void utils.trustclaw.getBuckets.invalidate();

  const createMutation = trpc.trustclaw.createBucket.useMutation({
    onSuccess: invalidate,
  });
  const updateMutation = trpc.trustclaw.updateBucket.useMutation({
    onSuccess: invalidate,
  });
  const deleteMutation = trpc.trustclaw.deleteBucket.useMutation({
    onError: trpcToastOnError,
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setEditing(null);
    setLabel("");
    setDescription("");
    setAlwaysInject(false);
    setDialogOpen(true);
  };

  const openEdit = (bucket: Bucket) => {
    setEditing(bucket);
    setLabel(bucket.label);
    setDescription(bucket.description ?? "");
    setAlwaysInject(bucket.alwaysInject);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          label,
          description: description.trim() || null,
          alwaysInject,
        });
        showSuccessToast("Bucket updated");
      } else {
        await createMutation.mutateAsync({
          label,
          description: description.trim() || undefined,
          alwaysInject,
        });
        showSuccessToast("Bucket created");
      }
      setDialogOpen(false);
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = label.trim().length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" /> Knowledge buckets
          </CardTitle>
          <CardDescription>
            Namespaces for memory. &quot;Always on&quot; buckets are injected
            into every reply like a skill; others are recalled by relevance.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !data || data.buckets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No buckets yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.buckets.map((bucket) => (
              <li
                key={bucket.id}
                className="border-border bg-card flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground truncate text-sm font-medium">
                      {bucket.label}
                    </span>
                    {bucket.alwaysInject && <Badge>Always on</Badge>}
                    {bucket.slug === DEFAULT_SLUG && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </div>
                  {bucket.description && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                      {bucket.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => openEdit(bucket)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {bucket.slug !== DEFAULT_SLUG && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete {bucket.label}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Memories in this bucket are moved to General, not
                            deleted. This can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              void deleteMutation.mutateAsync({ id: bucket.id })
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit bucket" : "New bucket"}
            </DialogTitle>
            <DialogDescription>
              Buckets keep memory organized. Turn on &quot;Always inject&quot;
              for curated knowledge the agent should use in every reply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Name (e.g. Competitors, Onboarding)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
            />
            <Textarea
              placeholder="What goes in this bucket? (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={200}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Always inject</Label>
                <p className="text-muted-foreground text-xs">
                  Add this bucket&apos;s memories to every reply, like a skill.
                </p>
              </div>
              <Switch
                checked={alwaysInject}
                onCheckedChange={setAlwaysInject}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
            >
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
