"use client";

import { AudioLines, Check } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { cn } from "~/lib/utils";

// Front-facing voice switcher: lives in the chat input's voice controls so
// anyone can change the assistant's spoken voice in place - no trip to Settings.
// Backed by the same getVoiceKeyStatus/setVoiceId as the Settings picker, so the
// choice flows through to both spoken replies and live calls.
export function VoicePicker({ disabled }: { disabled?: boolean }) {
  const utils = trpc.useUtils();
  const { data } = trpc.trustclaw.getVoiceKeyStatus.useQuery();
  const setVoice = trpc.trustclaw.setVoiceId.useMutation({
    onError: trpcToastOnError,
    onSuccess: () => void utils.trustclaw.getVoiceKeyStatus.invalidate(),
  });

  const voices = data?.voices ?? [];
  const current = data?.voiceId;
  if (voices.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-2xl"
          disabled={disabled}
          aria-label="Choose assistant voice"
        >
          <AudioLines className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
          Assistant voice
        </div>
        <div className="max-h-64 overflow-y-auto">
          {voices.map((voice) => {
            const active = voice.id === current;
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => void setVoice.mutateAsync({ voiceId: voice.id })}
                disabled={setVoice.isPending}
                className={cn(
                  "hover:bg-accent flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-60",
                  active && "bg-accent/60",
                )}
              >
                <span className="truncate">{voice.label}</span>
                {active && (
                  <Check className="text-primary size-4 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
