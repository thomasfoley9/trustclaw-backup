"use client";

import { useState, useRef, useEffect } from "react";
import { CheckCircle2, Loader2, Volume2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import {
  VOICE_SPEEDS,
  getVoiceSpeed,
  setVoiceSpeed,
  applyVoiceSpeed,
} from "../../_components/chat/voice-speed";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
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
import {
  showSuccessToast,
  showErrorToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { AlertDialog } from "~/components/core/confirm-dialog";

export function VoiceSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trustclaw.getVoiceKeyStatus.useQuery();
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Read the saved playback speed on mount (localStorage is client-only).
  useEffect(() => {
    setSpeed(getVoiceSpeed());
  }, []);

  function changeSpeed(value: number) {
    setSpeed(value);
    setVoiceSpeed(value);
  }

  const setKey = trpc.trustclaw.setVoiceApiKey.useMutation({
    onSuccess: () => {
      showSuccessToast("Voice key saved");
      setApiKey("");
      setEditing(false);
      void utils.trustclaw.getVoiceKeyStatus.invalidate();
    },
    onError: trpcToastOnError,
  });

  const clearKey = trpc.trustclaw.clearVoiceApiKey.useMutation({
    onSuccess: () => {
      showSuccessToast("Voice key removed");
      void utils.trustclaw.getVoiceKeyStatus.invalidate();
    },
    onError: trpcToastOnError,
  });

  const setVoice = trpc.trustclaw.setVoiceId.useMutation({
    onSuccess: () => {
      showSuccessToast("Voice updated");
      void utils.trustclaw.getVoiceKeyStatus.invalidate();
    },
    onError: trpcToastOnError,
  });

  const hasKey = !!data?.hasKey;
  const isBusy = setKey.isPending || clearKey.isPending || isLoading;
  const canSave = apiKey.trim().length >= 8 && !isBusy;
  const showInput = !hasKey || editing;

  async function testVoice() {
    setTesting(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hi! This is your assistant. I'm ready to talk.",
        }),
      });
      if (!res.ok) {
        showErrorToast("Couldn't play the voice - check your key and try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => URL.revokeObjectURL(url);
      applyVoiceSpeed(audio);
      await audio.play();
    } catch {
      showErrorToast("Voice playback failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          Voice
        </CardTitle>
        <CardDescription>
          Choose a voice for the assistant and manage your voice API key for
          spoken replies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasKey && !editing && (
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
                title="Remove your voice key?"
                description="Spoken read-aloud falls back to the shared voice (if available) until you add a key again."
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

        {showInput && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="voice-api-key">API key</Label>
              <Input
                id="voice-api-key"
                type="password"
                autoComplete="off"
                placeholder="sk_…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isBusy}
              />
              <p className="text-muted-foreground text-xs">
                We validate the key before saving it.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!canSave}
                onClick={() => void setKey.mutateAsync({ apiKey: apiKey.trim() })}
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

        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label>Voice</Label>
            <div className="flex gap-2">
              <Select
                value={data?.voiceId}
                onValueChange={(v) => void setVoice.mutateAsync({ voiceId: v })}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick a voice" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.voices ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => void testVoice()}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Test
                  </>
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Works whether you use your own key or the shared voice.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Speaking speed</Label>
            <div className="flex flex-wrap gap-2">
              {VOICE_SPEEDS.map((s) => (
                <Button
                  key={s.value}
                  type="button"
                  size="sm"
                  variant={speed === s.value ? "default" : "outline"}
                  onClick={() => changeSpeed(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              How fast replies are spoken - pitch stays natural. Tap Test to hear
              it.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
