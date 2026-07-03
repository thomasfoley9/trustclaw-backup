"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { OpenClawLogo } from "~/app/_components/openclaw-logo";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";

// Hard gate: after onboarding, the account stays locked until the user connects
// their own Composio key. Connecting it "activates" the account.
export function ComposioActivationGate() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [apiKey, setApiKey] = useState("");

  const setKey = trpc.trustclaw.setComposioApiKey.useMutation({
    onSuccess: () => {
      showSuccessToast("Account activated!");
      void utils.trustclaw.getComposioKeyStatus.invalidate();
      router.refresh();
    },
    onError: trpcToastOnError,
  });

  const canSave = apiKey.trim().length >= 8 && !setKey.isPending;

  return (
    <div className="relative flex min-h-full items-center justify-center p-4">
      <div
        className="ambient-glow pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div className="glass elevated relative w-full max-w-md space-y-5 rounded-2xl p-6 text-center sm:p-8">
        <div className="flex justify-center">
          <OpenClawLogo size={64} />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Activate your account
          </h1>
          <p className="text-muted-foreground text-sm">
            One step left - connect your Composio account to unlock your agent&apos;s
            500+ tools. Your key is encrypted at rest and only ever yours.
          </p>
        </div>
        <div className="space-y-3 text-left">
          <div className="space-y-2">
            <Label htmlFor="activation-composio-key">Composio API key</Label>
            <Input
              id="activation-composio-key"
              type="password"
              autoComplete="off"
              placeholder="ak_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={setKey.isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  void setKey.mutateAsync({ apiKey: apiKey.trim() });
                }
              }}
            />
          </div>
          <Button
            className="bg-accent-gradient h-11 w-full rounded-xl border-0 text-white shadow-md transition-transform hover:scale-[1.02]"
            disabled={!canSave}
            onClick={() => void setKey.mutateAsync({ apiKey: apiKey.trim() })}
          >
            {setKey.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating…
              </>
            ) : (
              "Activate my account"
            )}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Grab a key from your{" "}
            <a
              href="https://app.composio.dev/developers"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              Composio developer dashboard
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
