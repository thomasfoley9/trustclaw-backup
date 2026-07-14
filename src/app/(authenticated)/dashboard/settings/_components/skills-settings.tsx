"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Sparkles, Wrench, X, Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Skeleton } from "~/components/ui/skeleton";
import {
  showSuccessToast,
  showTrpcErrorToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { ErrorDisplay } from "~/components/core/error-display";
import { SkillCreatorDialog } from "./skill-creator-dialog";
import {
  createSkillInput,
  type CreateSkillInput,
} from "~/server/api/routers/trustclaw/createSkill.schema";
import type { RouterOutputs } from "~/clients/trpc";
import type { SkillDraft } from "~/server/api/routers/trustclaw/generateSkill.schema";

type Skill = RouterOutputs["trustclaw"]["getSkills"]["skills"][number];

const EMPTY_SKILL: CreateSkillInput = {
  name: "",
  whenToUse: "",
  instructions: [""],
  requiredInputs: [],
};

export function SkillsSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getSkills.useQuery();

  const [editorOpen, setEditorOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<CreateSkillInput>({
    resolver: zodResolver(createSkillInput),
    defaultValues: EMPTY_SKILL,
  });
  const instructions = form.watch("instructions");
  const requiredInputsArray = useFieldArray({
    control: form.control,
    name: "requiredInputs",
  });

  const invalidate = () => void utils.trustclaw.getSkills.invalidate();

  const createMutation = trpc.trustclaw.createSkill.useMutation({
    onSuccess: invalidate,
  });
  const updateMutation = trpc.trustclaw.updateSkill.useMutation({
    onSuccess: invalidate,
  });
  const deleteMutation = trpc.trustclaw.deleteSkill.useMutation({
    onError: trpcToastOnError,
    onSuccess: invalidate,
  });
  const toggleMutation = trpc.trustclaw.toggleSkill.useMutation({
    onError: trpcToastOnError,
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset(EMPTY_SKILL);
    setEditorOpen(true);
  };
  const openEdit = (s: Skill) => {
    setEditingId(s.id);
    form.reset({
      name: s.name,
      whenToUse: s.whenToUse,
      instructions: s.instructions.length > 0 ? s.instructions : [""],
      requiredInputs: s.requiredInputs,
    });
    setEditorOpen(true);
  };
  const openFromDraft = (draft: SkillDraft) => {
    setEditingId(null);
    form.reset({
      ...draft,
      instructions: draft.instructions.length > 0 ? draft.instructions : [""],
    });
    setEditorOpen(true);
  };

  const onSubmit = async (values: CreateSkillInput) => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...values });
        showSuccessToast("Skill updated");
      } else {
        await createMutation.mutateAsync(values);
        showSuccessToast("Skill created");
      }
      setEditorOpen(false);
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  // Blank rows are a UI affordance, not user intent - prune fully-empty step
  // and input rows before validating so they don't block the save. Rows with
  // only one side filled are kept so the field-level message points at them.
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = form.getValues();
    const keptInstructions = values.instructions.filter(
      (i) => i.trim().length > 0,
    );
    if (keptInstructions.length !== values.instructions.length) {
      form.setValue(
        "instructions",
        keptInstructions.length > 0 ? keptInstructions : [""],
      );
    }
    const keptInputs = values.requiredInputs.filter(
      (r) => r.name.trim().length > 0 || r.description.trim().length > 0,
    );
    if (keptInputs.length !== values.requiredInputs.length) {
      requiredInputsArray.replace(keptInputs);
    }
    void form.handleSubmit(onSubmit)(e);
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Skills
          </CardTitle>
          <CardDescription>
            Named things the agent can do. It gathers any missing inputs from
            you before performing a skill.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreatorOpen(true)}>
            <Sparkles className="h-4 w-4" /> From description
          </Button>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <ErrorDisplay
            message="Failed to load skills"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        ) : !data || data.skills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No skills yet. Describe one and the agent will draft it.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.skills.map((s) => (
              <li
                key={s.id}
                className="border-border bg-card flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <span className="text-foreground truncate text-sm font-medium">
                    {s.name}
                  </span>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    {s.whenToUse}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={s.enabled}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={(enabled) =>
                      void toggleMutation.mutateAsync({ id: s.id, enabled })
                    }
                    aria-label={s.enabled ? "Disable skill" : "Enable skill"}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Edit ${s.name}`}
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive h-8 w-8"
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This can&apos;t be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() =>
                            void deleteMutation.mutateAsync({ id: s.id })
                          }
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <SkillCreatorDialog
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        onDraft={openFromDraft}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit skill" : "New skill"}</DialogTitle>
            <DialogDescription>
              The agent will ask you for any required inputs it&apos;s missing
              before running the steps.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Draft a contract"
                          maxLength={60}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whenToUse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>When to use</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="When the user asks to create a new contract"
                          maxLength={300}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-1.5">
                  <Label>Steps</Label>
                  {instructions.map((_, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground w-4 pt-2 text-xs">
                        {i + 1}.
                      </span>
                      <FormField
                        control={form.control}
                        name={`instructions.${i}`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                placeholder="Describe a step…"
                                maxLength={1000}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label={`Remove step ${i + 1}`}
                        onClick={() => {
                          const current = form.getValues("instructions");
                          if (current.length > 1) {
                            form.setValue(
                              "instructions",
                              current.filter((_, idx) => idx !== i),
                            );
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      form.setValue("instructions", [
                        ...form.getValues("instructions"),
                        "",
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" /> Add step
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label>Required inputs</Label>
                  {requiredInputsArray.fields.map((fieldItem, i) => (
                    <div key={fieldItem.id} className="flex items-start gap-2">
                      <FormField
                        control={form.control}
                        name={`requiredInputs.${i}.name`}
                        render={({ field }) => (
                          <FormItem className="w-1/3">
                            <FormControl>
                              <Input
                                placeholder="Input name"
                                maxLength={60}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`requiredInputs.${i}.description`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                placeholder="What it is"
                                maxLength={200}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label={`Remove input ${i + 1}`}
                        onClick={() => requiredInputsArray.remove(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      requiredInputsArray.append({ name: "", description: "" })
                    }
                  >
                    <Plus className="h-4 w-4" /> Add input
                  </Button>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditorOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
