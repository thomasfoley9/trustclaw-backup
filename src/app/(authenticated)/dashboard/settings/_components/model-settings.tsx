"use client";

import { useEffect, useState } from "react";

import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import {
  MODELS,
  HOUSE_MODELS,
} from "~/app/(authenticated)/dashboard/_components/onboarding/onboarding.consts";
import { Spinner } from "~/components/ui/spinner";

interface ModelSettingsProps {
  // anthropicModel - the single agent behind text chat + tool work.
  currentModel: string;
  // agentAModel - voice-only narrator override (spoken briefs). null = use the
  // main model.
  currentAgentAModel: string | null;
}

// Sentinel for the "use the default" option (persists agentAModel as null).
const AGENT_A_DEFAULT = "__default__";

export function ModelSettings({
  currentModel,
  currentAgentAModel,
}: ModelSettingsProps) {
  const [selectedB, setSelectedB] = useState<string>(currentModel);
  const [selectedA, setSelectedA] = useState<string>(
    currentAgentAModel ?? AGENT_A_DEFAULT,
  );
  // Re-sync when the live values change under us (e.g. deleting the active
  // custom model resets it to the default server-side).
  useEffect(() => setSelectedB(currentModel), [currentModel]);
  useEffect(
    () => setSelectedA(currentAgentAModel ?? AGENT_A_DEFAULT),
    [currentAgentAModel],
  );

  const utils = trpc.useUtils();
  const {
    data: customData,
    error: customError,
    refetch: refetchCustom,
  } = trpc.trustclaw.getCustomModels.useQuery();
  const customModels = customData?.models ?? [];

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    // Retry transient cold-start 5xx (the write is idempotent) so a Vercel-edge
    // 503 doesn't surface as a false failure.
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      const status = error.data?.httpStatus;
      return status === undefined || status >= 500;
    },
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
    onSuccess: () => {
      showSuccessToast("Models updated");
      void utils.trustclaw.getInstance.invalidate();
    },
    onError: trpcToastOnError,
  });

  const hasChanges =
    selectedB !== currentModel ||
    selectedA !== (currentAgentAModel ?? AGENT_A_DEFAULT);

  // The shared model option groups (Claude presets, house models, custom).
  const modelGroups = (
    <>
      <SelectGroup>
        <SelectLabel>Claude</SelectLabel>
        {MODELS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            <span>{m.label}</span>
            <span className="text-muted-foreground ml-2">- {m.description}</span>
          </SelectItem>
        ))}
      </SelectGroup>
      <SelectGroup>
        <SelectLabel>On the house</SelectLabel>
        {HOUSE_MODELS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            <span>{m.label}</span>
            <span className="text-muted-foreground ml-2">- {m.description}</span>
          </SelectItem>
        ))}
      </SelectGroup>
      {customModels.length > 0 && (
        <SelectGroup>
          <SelectLabel>Custom</SelectLabel>
          {customModels.map((m) => (
            <SelectItem key={m.id} value={m.modelId}>
              <span>{m.label}</span>
              <span className="text-muted-foreground ml-2">- {m.modelId}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      )}
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Models</CardTitle>
        <CardDescription>
          Text chat runs on a single agent - the <strong>main model</strong>{" "}
          below does the reasoning, runs your tools, and writes the full reply.
          On <strong>voice</strong>, a second lightweight narrator condenses
          replies into something speakable; everything on screen stays
          full-length. Add your own models under Custom models below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {customError && (
          // Without this, a failed fetch silently drops the Custom group and
          // the pickers look like you have no custom models.
          <div className="flex items-center gap-2 text-sm">
            <span className="text-destructive">
              Couldn&apos;t load your custom models.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetchCustom()}
            >
              Try again
            </Button>
          </div>
        )}
        <div className="space-y-2">
          <Label>Main model - chat, work &amp; tools</Label>
          <Select value={selectedB} onValueChange={setSelectedB}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{modelGroups}</SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Powers every chat and does the heavy multi-tool work on your key.
            Opus-grade recommended for serious automation.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Voice narrator - spoken replies only</Label>
          <Select value={selectedA} onValueChange={setSelectedA}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={AGENT_A_DEFAULT}>
                  <span>Default</span>
                  <span className="text-muted-foreground ml-2">
                    - same as the main model
                  </span>
                </SelectItem>
              </SelectGroup>
              {modelGroups}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Only used when replies are spoken aloud - it shortens the on-screen
            answer into a quick verbal brief. Text chat never uses it.
          </p>
        </div>

        <Button
          variant="outline"
          disabled={!hasChanges || updateSettings.isPending}
          onClick={() =>
            void updateSettings.mutateAsync({
              anthropicModel: selectedB,
              agentAModel:
                selectedA === AGENT_A_DEFAULT ? null : selectedA,
            })
          }
        >
          {updateSettings.isPending ? (
            <>
              <Spinner className="mr-2" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
