"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "~/components/ui/form";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import {
  generateSkillInput,
  type GenerateSkillInput,
  type SkillDraft,
} from "~/server/api/routers/trustclaw/generateSkill.schema";

export function SkillCreatorDialog({
  open,
  onOpenChange,
  onDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDraft: (draft: SkillDraft) => void;
}) {
  const form = useForm<GenerateSkillInput>({
    resolver: zodResolver(generateSkillInput),
    defaultValues: { description: "" },
  });

  const generate = trpc.trustclaw.generateSkill.useMutation({
    onSuccess: (draft) => {
      onDraft(draft);
      form.reset();
      onOpenChange(false);
    },
    onError: trpcToastOnError,
  });

  const onSubmit = async (values: GenerateSkillInput) => {
    try {
      await generate.mutateAsync(values);
    } catch {
      // trpcToastOnError already surfaced the failure.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Create a skill from a description
          </DialogTitle>
          <DialogDescription>
            Describe what you want the agent to be able to do. It&apos;ll draft
            the steps and the inputs to ask for - you can edit everything before
            saving.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. When I say 'draft a contract', collect the client name, scope, and fee, then produce a contract document with those details."
                      rows={5}
                      maxLength={4000}
                      disabled={generate.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={generate.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={generate.isPending}>
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
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
