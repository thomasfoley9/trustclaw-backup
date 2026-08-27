"use client";

import { ComposioApiKeySettingsSkeleton } from "./composio-api-key-settings.skeleton";
import { useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
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
import { Spinner } from "~/components/ui/spinner";

export function ComposioApiKeySettings() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getComposioKeyStatus.useQuery();
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(false);

  const setKey = trpc.trustclaw.setComposioApiKey.useMutation({
    onSuccess: (data) => {
      // A key change re-points every integration at a different Composio
      // account, so the EA's Slack binding was reset server-side. Say so -
      // silently-disabled presence is exactly the failure mode we avoid.
      showSuccessToast(
        data.eaSlackReset
          ? "Composio API key saved. Slack presence was reset - re-enable it on Channels to bind #ea through the new account."
          : "Composio API key saved",
      );
      setApiKey("");
      setEditing(false);
      void utils.trustclaw.getComposioKeyStatus.invalidate();
      void utils.trustclaw.getChannels.invalidate();
    },
    onError: trpcToastOnError,
  });

  const clearKey = trpc.trustclaw.clearComposioApiKey.useMutation({
    onSuccess: (data) => {
      showSuccessToast(
        data.eaSlackReset
          ? "Composio API key removed. Slack presence was reset along with it."
          : "Composio API key removed",
      );
      void utils.trustclaw.getComposioKeyStatus.invalidate();
      void utils.trustclaw.getChannels.invalidate();
    },
    onError: trpcToastOnError,
  });

  // The card manages the user's OWN key; shared-platform mode (tools on the
  // house key) renders its own state below instead of a fake "Connected".
  const hasKey = !!data?.byoKey;
  const onSharedKey = !!data?.shared;
  const isBusy = setKey.isPending || clearKey.isPending || isLoading;
  const canSave = apiKey.trim().length >= 8 && !isBusy;

  const showInput = !hasKey || editing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Composio API key
        </CardTitle>
        <CardDescription>
          {onSharedKey
            ? "Tools run on the house Composio key - no key needed. Your Gmail, Calendar, and other connections are private to your account. Add your own key below to use your own Composio workspace instead."
            : "Bring your own key - every user authenticates against Composio with their own."}{" "}
          Grab one from your{" "}
          <a
            href="https://app.composio.dev/developers"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-4 hover:underline"
          >
            Composio developer dashboard
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* A failed status fetch must not render the "no key yet" input - the
            key may exist. Show the failure and let the user retry. */}
        {error && (
          <ErrorDisplay
            message="Failed to load your Composio key status"
            retryText="Try again"
            onRetry={() => void refetch()}
          />
        )}
        {!error && isLoading && <ComposioApiKeySettingsSkeleton />}
        {!error && !isLoading && onSharedKey && !editing && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <CheckCircle2 className="text-chart-2 h-4 w-4 shrink-0" />
            <span className="font-medium">Tools active</span>
            <span className="text-muted-foreground">
              on the house key, connections scoped to you
            </span>
          </div>
        )}
        {!error && !isLoading && hasKey && !editing && (
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
                title="Remove your Composio key?"
                description="Every tool and integration stops working until you add a key again. Connected accounts are kept."
                confirmLabel="Remove key"
                onConfirm={async () => {
                  await clearKey.mutateAsync();
                }}
                isPending={clearKey.isPending}
                trigger={
                  <Button variant="ghost" size="sm" disabled={isBusy}>
                    {clearKey.isPending ? (
                      <Spinner />
                    ) : (
                      "Remove"
                    )}
                  </Button>
                }
              />
            </div>
          </div>
        )}

        {!error && !isLoading && showInput && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="composio-api-key">API key</Label>
              <Input
                id="composio-api-key"
                type="password"
                autoComplete="off"
                placeholder="ak_…"
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
                We validate the key with Composio before saving it. Stored
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
                    <Spinner className="mr-2" />
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
