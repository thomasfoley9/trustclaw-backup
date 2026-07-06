"use client";

import { useState } from "react";
import { Boxes, CheckCircle2, KeyRound, Loader2, Trash2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { AlertDialog } from "~/components/core/confirm-dialog";

export function CustomModelsSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getCustomModels.useQuery();
  const models = data?.models ?? [];

  const [modelId, setModelId] = useState("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  const invalidate = () => {
    void utils.trustclaw.getCustomModels.invalidate();
    void utils.trustclaw.getInstance.invalidate();
  };

  const addModel = trpc.trustclaw.addCustomModel.useMutation({
    onSuccess: () => {
      showSuccessToast("Custom model saved");
      setModelId("");
      setLabel("");
      setApiKey("");
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
  const canAdd = /^[a-z0-9-]+\/[\w.:/-]+$/i.test(modelId.trim()) && !isBusy;

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

        <div className="space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cm-model-id">Model id</Label>
              <Input
                id="cm-model-id"
                placeholder="openai/gpt-4o"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={isBusy}
              />
              {modelId.trim() && !canAdd && (
                <p className="text-muted-foreground text-xs">
                  Use provider/model format, e.g. openai/gpt-4o.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-label">Label (optional)</Label>
              <Input
                id="cm-label"
                placeholder="GPT-4o"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                disabled={isBusy}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-key">Provider API key (optional)</Label>
            <Input
              id="cm-key"
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isBusy}
            />
            <p className="text-muted-foreground text-xs">
              Stored encrypted at rest. Required to run the model (Anthropic
              custom ids reuse your Anthropic key).
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!canAdd}
            onClick={() =>
              void addModel.mutateAsync({
                modelId: modelId.trim(),
                label: label.trim() || undefined,
                providerApiKey: apiKey.trim() || undefined,
              })
            }
          >
            {addModel.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Add model
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
