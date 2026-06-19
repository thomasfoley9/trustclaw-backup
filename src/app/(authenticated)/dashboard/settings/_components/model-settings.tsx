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
import { MODELS } from "~/app/(authenticated)/dashboard/_components/onboarding/onboarding.consts";

interface ModelSettingsProps {
  currentModel: string;
}

export function ModelSettings({ currentModel }: ModelSettingsProps) {
  const [selectedModel, setSelectedModel] = useState<string>(currentModel);
  // Re-sync when the live model changes under us (e.g. deleting the active
  // custom model resets it to the default server-side).
  useEffect(() => setSelectedModel(currentModel), [currentModel]);
  const utils = trpc.useUtils();
  const { data: customData } = trpc.trustclaw.getCustomModels.useQuery();
  const customModels = customData?.models ?? [];

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    onSuccess: () => {
      showSuccessToast("Model updated");
      void utils.trustclaw.getInstance.invalidate();
    },
    onError: trpcToastOnError,
  });

  const hasChanges = selectedModel !== currentModel;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model</CardTitle>
        <CardDescription>
          Choose which model powers your assistant. Add your own under Custom
          models below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Model</Label>
          <Select
            value={selectedModel}
            onValueChange={(val) => setSelectedModel(val)}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Claude</SelectLabel>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span>{m.label}</span>
                    <span className="text-muted-foreground ml-2">
                      - {m.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
              {customModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Custom</SelectLabel>
                  {customModels.map((m) => (
                    <SelectItem key={m.id} value={m.modelId}>
                      <span>{m.label}</span>
                      <span className="text-muted-foreground ml-2">
                        - {m.modelId}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={!hasChanges || updateSettings.isPending}
          onClick={() =>
            void updateSettings.mutateAsync({ anthropicModel: selectedModel })
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
