"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, CheckCircle2, KeyRound, Loader2, Trash2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { ErrorDisplay } from "~/components/core/error-display";
import { AlertDialog } from "~/components/core/confirm-dialog";
import {
  addCustomModelInput,
  type AddCustomModelInput,
} from "~/server/api/routers/trustclaw/addCustomModel.schema";

export function CustomModelsSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getCustomModels.useQuery();
  const models = data?.models ?? [];

  const form = useForm<AddCustomModelInput>({
    resolver: zodResolver(addCustomModelInput),
    defaultValues: { modelId: "" },
  });

  const invalidate = () => {
    void utils.trustclaw.getCustomModels.invalidate();
    void utils.trustclaw.getInstance.invalidate();
  };

  const addModel = trpc.trustclaw.addCustomModel.useMutation({
    onSuccess: () => {
      showSuccessToast("Custom model saved");
      form.reset({ modelId: "" });
      invalidate();
    },
    onError: trpcToastOnError,
  });

  const deleteModel = trpc.trustclaw.deleteCustomModel.useMutation({
    onSuccess: () => {
      showSuccessToast("Custom model removed");
      invalidate();
    },
    onError: trpcToastOnError,
  });

  const isBusy = addModel.isPending || deleteModel.isPending;

  const onSubmit = async (values: AddCustomModelInput) => {
    try {
      await addModel.mutateAsync(values);
    } catch {
      // trpcToastOnError already surfaced the failure.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="h-4 w-4" /> Custom models
        </CardTitle>
        <CardDescription>
          Bring any <code>provider/model</code> id - e.g.{" "}
          <code>deepseek/deepseek-chat</code> or{" "}
          <code>openrouter/moonshotai/kimi-k2</code> - plus that provider&apos;s
          API key. Works with OpenAI, Anthropic, Google, DeepSeek, Moonshot,
          OpenRouter, Groq, Together, xAI, and Fireworks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <ErrorDisplay
            message="Failed to load custom models"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        ) : models.length > 0 ? (
          <ul className="space-y-2">
            {models.map((m) => (
              <li
                key={m.id}
                className="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {m.label}
                    </span>
                    {m.hasKey ? (
                      <Badge variant="secondary" className="gap-1">
                        <KeyRound className="h-3 w-3" /> Direct
                      </Badge>
                    ) : m.modelId.startsWith("anthropic/") ? (
                      <Badge variant="secondary" className="gap-1">
                        <KeyRound className="h-3 w-3" /> Your Anthropic key
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Needs key</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground block truncate font-mono text-xs">
                    {m.modelId}
                    {m.maskedKey ? ` · ${m.maskedKey}` : ""}
                  </span>
                </div>
                <AlertDialog
                  title={`Delete "${m.label}"?`}
                  description="This removes the custom model and its stored provider key. Any agent set to it falls back to the default model."
                  confirmLabel="Delete model"
                  onConfirm={async () => {
                    await deleteModel.mutateAsync({ id: m.id });
                  }}
                  isPending={deleteModel.isPending}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-8 w-8 shrink-0"
                      disabled={isBusy}
                      aria-label={`Delete ${m.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}

        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-3 border-t pt-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="modelId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model id</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="openai/gpt-4o"
                        disabled={isBusy}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="GPT-4o"
                        maxLength={60}
                        disabled={isBusy}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || undefined)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="providerApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider API key (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="sk-…"
                      disabled={isBusy}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || undefined)
                      }
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    We validate the key with the provider before saving it.
                    Stored encrypted (AES-256-GCM); only this instance can read
                    it. Required to run the model (Anthropic custom ids reuse
                    your Anthropic key).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="outline" disabled={isBusy}>
              {addModel.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Add model
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
