"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { MODELS } from "../onboarding/onboarding.consts";

const DEFAULT_MODEL = "claude-opus-4-8";

// Short trigger label, e.g. "Opus 4.8" / "gpt-4o".
function shortLabel(modelId: string): string {
  const preset = MODELS.find((m) => m.value === modelId);
  if (preset) return preset.label.replace(/^Claude /, "");
  return modelId.includes("/") ? (modelId.split("/")[1] ?? modelId) : modelId;
}

// Cursor-style inline model switcher that lives at the bottom of the chat bar.
export function ModelPicker() {
  const utils = trpc.useUtils();
  const { data: instanceData } = trpc.trustclaw.getInstance.useQuery();
  const { data: customData } = trpc.trustclaw.getCustomModels.useQuery();
  const current = instanceData?.instance?.anthropicModel ?? DEFAULT_MODEL;
  const customModels = customData?.models ?? [];
  const [open, setOpen] = useState(false);

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    onError: (error) => {
      trpcToastOnError(error);
      void utils.trustclaw.getInstance.invalidate();
    },
  });

  const selectModel = (modelId: string) => {
    setOpen(false);
    if (modelId === current) return;
    // Optimistic: flip the displayed model instantly, like Cursor.
    utils.trustclaw.getInstance.setData(undefined, (prev) =>
      prev?.instance
        ? { ...prev, instance: { ...prev.instance, anthropicModel: modelId } }
        : prev,
    );
    void updateSettings.mutateAsync({ anthropicModel: modelId });
  };

  const rowClass = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
      "hover:bg-accent focus-visible:bg-accent outline-none",
      active && "bg-accent/60",
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-7 gap-1 rounded-lg px-2 text-xs font-medium"
        >
          {shortLabel(current)}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-1">
        <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
          Claude
        </div>
        {MODELS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => selectModel(m.value)}
            className={rowClass(current === m.value)}
          >
            <Check
              className={cn(
                "size-4 shrink-0",
                current === m.value
                  ? "text-primary opacity-100"
                  : "opacity-0",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{m.label}</span>
              <span className="text-muted-foreground block text-xs">
                {m.description}
              </span>
            </span>
            <span className="text-muted-foreground text-xs">{m.cost}</span>
          </button>
        ))}

        {customModels.length > 0 && (
          <>
            <div className="text-muted-foreground mt-1 px-2 py-1.5 text-xs font-semibold">
              Custom
            </div>
            {customModels.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectModel(m.modelId)}
                className={rowClass(current === m.modelId)}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    current === m.modelId
                      ? "text-primary opacity-100"
                      : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.label}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {m.modelId}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
