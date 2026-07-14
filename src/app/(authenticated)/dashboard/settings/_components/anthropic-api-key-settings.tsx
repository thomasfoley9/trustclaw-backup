"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { ErrorDisplay } from "~/components/core/error-display";
import { AlertDialog } from "~/components/core/confirm-dialog";

export function AnthropicApiKeySettings() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getAnthropicKeyStatus.useQuery();
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(false);

  const setKey = trpc.trustclaw.setAnthropicApiKey.useMutation({
    onSuccess: () => {
      showSuccessToast("Anthropic API key saved");
      setApiKey("");
      setEditing(false);
      void utils.trustclaw.getAnthropicKeyStatus.invalidate();
    },
    onError: trpcToastOnError,
  });

  const clearKey = trpc.trustclaw.clearAnthropicApiKey.useMutation({
    onSuccess: () => {
      showSuccessToast("Anthropic API key removed");
      void utils.trustclaw.getAnthropicKeyStatus.invalidate();
    },
    onError: trpcToastOnError,
  });

  const hasKey = !!data?.hasKey;
  const isBusy = setKey.isPending || clearKey.isPending || isLoading;
  const canSave = apiKey.trim().length >= 20 && !isBusy;

  const showInput = !hasKey || editing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Anthropic API key
        </CardTitle>
        <CardDescription>
          Bring your own key - your Claude usage is billed to your own Anthropic
          account. Chat won&apos;t run until this is set. Grab one from the{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-4 hover:underline"
          >
            Anthropic console
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* A failed status fetch must not render the "no key yet" input - the
            key may exist. Show the failure and let the user retry. */}
        {error && (
          <ErrorDisplay
            message="Failed to load your Anthropic key status"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        )}
        {!error && hasKey && !editing && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <CheckCircle2 className="text-chart-2 h-4 w-4 shrink-0" />
              <span className="shrink-0 font-medium">Connected</span>
              <span className="text-muted-foreground truncate font-mono">
                {data?.maskedKey}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={isBusy}
              >
                Replace
              </Button>
              <AlertDialog
                title="Remove your Anthropic key?"
                description="Chat stops working until you add a key again. Your conversations and settings are kept."
                confirmLabel="Remove key"
                onConfirm={async () => {
                  await clearKey.mutateAsync();
                }}
                isPending={clearKey.isPending}
                trigger={
                  <Button variant="ghost" size="sm" disabled={isBusy}>
                    {clearKey.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Remove"
                    )}
                  </Button>
                }
              />
            </div>
          </div>
        )}

        {!error && showInput && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="anthropic-api-key">API key</Label>
              <Input
                id="anthropic-api-key"
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) {
                    e.preventDefault();
                    void setKey.mutateAsync({ apiKey: apiKey.trim() });
                  }
                }}
                disabled={isBusy}
              />
              <p className="text-muted-foreground text-xs">
                We validate the key with Anthropic before saving it. Stored
                encrypted (AES-256-GCM); only this instance can read it.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!canSave}
                onClick={() =>
                  void setKey.mutateAsync({ apiKey: apiKey.trim() })
                }
              >
                {setKey.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              {hasKey && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setApiKey("");
                  }}
                  disabled={isBusy}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
