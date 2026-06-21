"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

interface ModelSettingsProps {
  // Agent B (anthropicModel) — the worker that runs tools + does the heavy work.
  currentModel: string;
  // Agent A (agentAModel) — the voice/conversation front. null = use the default.
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
  const { data: customData } = trpc.trustclaw.getCustomModels.useQuery();
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
        <SelectLabel>On the house 🍻</SelectLabel>
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
          Two agents power the assistant. <strong>Agent A</strong> is the voice &
          conversation front — it talks, holds the persona, and decides what to
          do. <strong>Agent B</strong> does the heavy work with your tools. Pick a
          model for each; add your own under Custom models below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Agent A — voice &amp; conversation</Label>
          <Select value={selectedA} onValueChange={setSelectedA}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={AGENT_A_DEFAULT}>
                  <span>Default</span>
                  <span className="text-muted-foreground ml-2">
                    - house voice, free for everyone
                  </span>
                </SelectItem>
              </SelectGroup>
              {modelGroups}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            The fast, conversational front. Default uses a house model so voice
            works for everyone with no key.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Agent B — work &amp; tools</Label>
          <Select value={selectedB} onValueChange={setSelectedB}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{modelGroups}</SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Does the heavy multi-tool work on your key. Opus-grade recommended for
            serious automation.
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
