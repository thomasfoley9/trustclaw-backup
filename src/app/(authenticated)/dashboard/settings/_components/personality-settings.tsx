"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, Drama, Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
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
import { cn } from "~/lib/utils";
import {
  showSuccessToast,
  showTrpcErrorToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import {
  PersonalityAvatar,
  PERSONALITY_AVATARS,
} from "~/app/_components/personality-avatar";
import { DEFAULT_AVATAR_KEY } from "~/app/_components/personality-avatars-data";
import {
  STARTER_PERSONALITIES,
  buildPersonaPrompt,
  type StarterPersonality,
} from "~/server/api/routers/trustclaw/personalities";
import type { RouterOutputs } from "~/clients/trpc";

type Personality =
  RouterOutputs["trustclaw"]["getPersonalities"]["personalities"][number];

function randomAvatarKey(): string {
  const i = Math.floor(Math.random() * PERSONALITY_AVATARS.length);
  return PERSONALITY_AVATARS[i]?.key ?? DEFAULT_AVATAR_KEY;
}

export function PersonalitySettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getPersonalities.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Personality | null>(null);
  const [name, setName] = useState("");
  const [avatarKey, setAvatarKey] = useState<string>(DEFAULT_AVATAR_KEY);
  const [prompt, setPrompt] = useState("");

  const invalidate = () => void utils.trustclaw.getPersonalities.invalidate();

  const createMutation = trpc.trustclaw.createPersonality.useMutation({
    onSuccess: invalidate,
  });
  const updateMutation = trpc.trustclaw.updatePersonality.useMutation({
    onSuccess: invalidate,
  });
  const deleteMutation = trpc.trustclaw.deletePersonality.useMutation({
    onError: trpcToastOnError,
    onSuccess: invalidate,
  });
  const setActiveMutation = trpc.trustclaw.updateSettings.useMutation({
    onError: trpcToastOnError,
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setAvatarKey(randomAvatarKey());
    setPrompt("");
    setDialogOpen(true);
  };

  const openEdit = (personality: Personality) => {
    setEditing(personality);
    setName(personality.name);
    setAvatarKey(personality.avatarKey ?? DEFAULT_AVATAR_KEY);
    setPrompt(personality.prompt);
    setDialogOpen(true);
  };

  // Prefill the create form from a starter template. Everything stays editable -
  // this just seeds name/avatar/prompt. Names are unique per instance, so
  // de-dupe against existing ones up front ("Dad" -> "Dad 2") to avoid a save
  // failure. buildPersonaPrompt() wraps the voice with the shared guardrails.
  const applyTemplate = (t: StarterPersonality) => {
    const taken = new Set(
      (data?.personalities ?? []).map((p) => p.name.trim().toLowerCase()),
    );
    let candidate: string = t.name;
    for (let i = 2; taken.has(candidate.toLowerCase()) && i < 100; i++) {
      candidate = `${t.name} ${i}`;
    }
    setName(candidate);
    setAvatarKey(t.avatarKey);
    setPrompt(buildPersonaPrompt(t.voice));
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          name,
          prompt,
          avatarKey,
          emoji: null,
        });
        showSuccessToast("Personality updated");
      } else {
        await createMutation.mutateAsync({
          name,
          prompt,
          avatarKey,
        });
        showSuccessToast("Personality created");
      }
      setDialogOpen(false);
    } catch (error) {
      showTrpcErrorToast(error);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = name.trim().length > 0 && prompt.trim().length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Drama className="h-4 w-4" /> Personalities
          </CardTitle>
          <CardDescription>
            Swappable voices for your agent. Switch the active one from the chat
            header.
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
        ) : !data || data.personalities.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No personalities yet. Create one to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.personalities.map((personality) => {
              const isActive = personality.id === data.activePersonalityId;
              return (
                <li
                  key={personality.id}
                  className="border-border bg-card flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <PersonalityAvatar
                        avatarKey={personality.avatarKey}
                        size={28}
                      />
                      <span className="text-foreground truncate text-sm font-medium">
                        {personality.name}
                      </span>
                      {personality.isPreset && (
                        <Badge variant="secondary">Preset</Badge>
                      )}
                      {isActive && <Badge>Active</Badge>}
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                      {personality.prompt}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setActiveMutation.isPending}
                        onClick={() =>
                          void setActiveMutation.mutateAsync({
                            activePersonalityId: personality.id,
                          })
                        }
                      >
                        <Check className="h-4 w-4" /> Use
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Edit ${personality.name}`}
                      onClick={() => openEdit(personality)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive h-8 w-8"
                          aria-label={`Delete ${personality.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete {personality.name}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This can&apos;t be undone. If it&apos;s the active
                            personality, your agent falls back to its default
                            voice.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              void deleteMutation.mutateAsync({
                                id: personality.id,
                              })
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit personality" : "New personality"}
            </DialogTitle>
            <DialogDescription>
              The prompt defines the agent&apos;s voice. Safety boundaries are
              always enforced regardless of personality.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {!editing && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs font-medium">
                  Start from a template{" "}
                  <span className="font-normal">(optional - edit anything after)</span>
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {STARTER_PERSONALITIES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      title={t.blurb}
                      onClick={() => applyTemplate(t)}
                      className="border-border hover:border-primary/50 hover:bg-accent flex w-28 shrink-0 flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors"
                    >
                      <PersonalityAvatar
                        avatarKey={t.avatarKey}
                        size={32}
                        fallback={false}
                      />
                      <span className="text-foreground text-xs leading-tight font-medium">
                        {t.name}
                      </span>
                      <span className="text-muted-foreground line-clamp-2 text-[10px] leading-tight">
                        {t.blurb}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <PersonalityAvatar avatarKey={avatarKey} size={44} />
              <Input
                placeholder="Name (e.g. Acme Corp, Unhinged)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">Avatar</p>
              <div className="grid max-h-60 grid-cols-5 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-8 md:grid-cols-10">
                {PERSONALITY_AVATARS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    title={a.label}
                    aria-label={a.label}
                    onClick={() => setAvatarKey(a.key)}
                    className={cn(
                      "flex items-center justify-center rounded-md p-1 transition-colors hover:bg-accent",
                      avatarKey === a.key && "bg-accent ring-ring ring-2",
                    )}
                  >
                    <PersonalityAvatar avatarKey={a.key} size={30} fallback={false} />
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              placeholder="Describe how the agent should talk and behave..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={9}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={!canSave || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
