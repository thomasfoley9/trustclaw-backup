"use client";

import { KnowledgeBucketsSettingsSkeleton } from "./knowledge-buckets-settings.skeleton";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Plus, Trash2, FolderTree } from "lucide-react";
import { EmptyState } from "~/components/core/empty-state";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  showSuccessToast,
  showTrpcErrorToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { ErrorDisplay } from "~/components/core/error-display";
import {
  createBucketInput,
  type CreateBucketInput,
} from "~/server/api/routers/trustclaw/createBucket.schema";
import type { RouterOutputs } from "~/clients/trpc";
import { Spinner } from "~/components/ui/spinner";

type Bucket = RouterOutputs["trustclaw"]["getBuckets"]["buckets"][number];
// alwaysInject carries a Zod default, so the form's raw (input) type differs
// from the parsed (output) type handleSubmit delivers.
type CreateBucketFormInput = z.input<typeof createBucketInput>;

const DEFAULT_SLUG = "general";

export function KnowledgeBucketsSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getBuckets.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bucket | null>(null);

  const form = useForm<CreateBucketFormInput, unknown, CreateBucketInput>({
    resolver: zodResolver(createBucketInput),
    defaultValues: { label: "", description: "", alwaysInject: false },
  });

  // Bucket changes ripple beyond the list: the server can reassign the active
  // bucket (navbar selector) and recategorize memories (list badges).
  const invalidate = () => {
    void utils.trustclaw.getBuckets.invalidate();
    void utils.trustclaw.getInstance.invalidate();
    void utils.trustclaw.getMemories.invalidate();
  };

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
    form.reset({ label: "", description: "", alwaysInject: false });
    setDialogOpen(true);
  };

  const openEdit = (bucket: Bucket) => {
    setEditing(bucket);
    form.reset({
      label: bucket.label,
      description: bucket.description ?? "",
      alwaysInject: bucket.alwaysInject,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: CreateBucketInput) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          label: values.label,
          description: values.description?.length ? values.description : null,
          alwaysInject: values.alwaysInject,
        });
        showSuccessToast("Bucket updated");
      } else {
        await createMutation.mutateAsync({
          label: values.label,
          description: values.description?.length
            ? values.description
            : undefined,
          alwaysInject: values.alwaysInject,
        });
        showSuccessToast("Bucket created");
      }
      setDialogOpen(false);
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

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
          <KnowledgeBucketsSettingsSkeleton />
        ) : error ? (
          <ErrorDisplay
            message="Failed to load knowledge buckets"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        ) : !data || data.buckets.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="No buckets yet"
            description="Buckets are namespaces for memory. Create one to start organizing what your agent knows."
            action={
              <Button size="sm" variant="outline" onClick={openCreate}>
                <Plus className="h-4 w-4" /> New bucket
              </Button>
            }
          />
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
                    aria-label={`Edit ${bucket.label}`}
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
                          aria-label={`Delete ${bucket.label}`}
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
          <Form {...form}>
            <form
              onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
              className="space-y-3"
            >
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Name (e.g. Competitors, Onboarding)"
                        maxLength={40}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="What goes in this bucket? (optional)"
                        rows={3}
                        maxLength={200}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="alwaysInject"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Always inject</FormLabel>
                      <FormDescription className="text-xs">
                        Add this bucket&apos;s memories to every reply, like a
                        skill.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Spinner className="mr-2" />}
                  {editing ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
