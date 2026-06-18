"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import type { SkillDraft } from "~/server/api/routers/trustclaw/generateSkill.schema";

export function SkillCreatorDialog({
  open,
  onOpenChange,
  onDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDraft: (draft: SkillDraft) => void;
}) {
  const [description, setDescription] = useState("");

  const generate = trpc.trustclaw.generateSkill.useMutation({
    onSuccess: (draft) => {
      onDraft(draft);
      setDescription("");
      onOpenChange(false);
    },
    onError: trpcToastOnError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Create a skill from a description
          </DialogTitle>
          <DialogDescription>
            Describe what you want the agent to be able to do. It&apos;ll draft
            the steps and the inputs to ask for — you can edit everything before
            saving.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="e.g. When I say 'draft a contract', collect the client name, scope, and fee, then produce a contract document with those details."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={4000}
          disabled={generate.isPending}
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
          >
            Cancel
          </Button>
          <Button
            disabled={description.trim().length < 10 || generate.isPending}
            onClick={() =>
              void generate.mutateAsync({ description: description.trim() })
            }
          >
            {generate.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Drafting…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
