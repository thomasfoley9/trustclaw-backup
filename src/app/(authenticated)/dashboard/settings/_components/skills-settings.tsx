"use client";

import { useState } from "react";
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
import { Skeleton } from "~/components/ui/skeleton";
import {
  showSuccessToast,
  showTrpcErrorToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { SkillCreatorDialog } from "./skill-creator-dialog";
import type { RouterOutputs } from "~/clients/trpc";
import type { SkillDraft } from "~/server/api/routers/trustclaw/generateSkill.schema";

type Skill = RouterOutputs["trustclaw"]["getSkills"]["skills"][number];
type RequiredInput = { name: string; description: string };

export function SkillsSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getSkills.useQuery();

  const [editorOpen, setEditorOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [instructions, setInstructions] = useState<string[]>([""]);
  const [requiredInputs, setRequiredInputs] = useState<RequiredInput[]>([]);

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

  const loadFields = (s: {
    name: string;
    whenToUse: string;
    instructions: string[];
    requiredInputs: RequiredInput[];
  }) => {
    setName(s.name);
    setWhenToUse(s.whenToUse);
    setInstructions(s.instructions.length > 0 ? s.instructions : [""]);
    setRequiredInputs(s.requiredInputs);
  };

  const openCreate = () => {
    setEditingId(null);
    loadFields({ name: "", whenToUse: "", instructions: [""], requiredInputs: [] });
    setEditorOpen(true);
  };
  const openEdit = (s: Skill) => {
    setEditingId(s.id);
    loadFields(s);
    setEditorOpen(true);
  };
  const openFromDraft = (draft: SkillDraft) => {
    setEditingId(null);
    loadFields(draft);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const cleanInstructions = instructions.map((i) => i.trim()).filter(Boolean);
    const cleanInputs = requiredInputs
      .map((r) => ({ name: r.name.trim(), description: r.description.trim() }))
      .filter((r) => r.name && r.description);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          name,
          whenToUse,
          instructions: cleanInstructions,
          requiredInputs: cleanInputs,
        });
        showSuccessToast("Skill updated");
      } else {
        await createMutation.mutateAsync({
          name,
          whenToUse,
          instructions: cleanInstructions,
          requiredInputs: cleanInputs,
        });
        showSuccessToast("Skill created");
      }
      setEditorOpen(false);
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const validInstructions = instructions.some((i) => i.trim().length > 0);
  const canSave =
    name.trim().length > 0 && whenToUse.trim().length > 0 && validInstructions;

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
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Draft a contract"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label>When to use</Label>
              <Input
                placeholder="When the user asks to create a new contract"
                value={whenToUse}
                onChange={(e) => setWhenToUse(e.target.value)}
                maxLength={300}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Steps</Label>
              {instructions.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-4 text-xs">
                    {i + 1}.
                  </span>
                  <Input
                    value={step}
                    onChange={(e) =>
                      setInstructions((prev) =>
                        prev.map((s, idx) => (idx === i ? e.target.value : s)),
                      )
                    }
                    placeholder="Describe a step…"
                    maxLength={1000}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setInstructions((prev) =>
                        prev.length > 1
                          ? prev.filter((_, idx) => idx !== i)
                          : prev,
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setInstructions((prev) => [...prev, ""])}
              >
                <Plus className="h-4 w-4" /> Add step
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Required inputs</Label>
              {requiredInputs.map((inp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={inp.name}
                    onChange={(e) =>
                      setRequiredInputs((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, name: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Input name"
                    className="w-1/3"
                    maxLength={60}
                  />
                  <Input
                    value={inp.description}
                    onChange={(e) =>
                      setRequiredInputs((prev) =>
                        prev.map((r, idx) =>
                          idx === i ? { ...r, description: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="What it is"
                    maxLength={200}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setRequiredInputs((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
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
                  setRequiredInputs((prev) => [
                    ...prev,
                    { name: "", description: "" },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add input
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={!canSave || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
