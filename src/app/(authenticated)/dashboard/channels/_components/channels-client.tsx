"use client";

import { useState } from "react";
import { MessageSquareText, Radio, Smartphone, Send } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { ErrorDisplay } from "~/components/core/error-display";
import {
  trpcToastOnError,
  showTrpcErrorToast,
  showSuccessToast,
} from "~/components/core/toast-notifications";
import { ChannelsClientSkeleton } from "./channels-client.skeleton";

export function ChannelsClient() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } =
    trpc.trustclaw.getChannels.useQuery();

  const updateChannels = trpc.trustclaw.updateChannels.useMutation({
    onError: trpcToastOnError,
    onSuccess: () => void utils.trustclaw.getChannels.invalidate(),
  });

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);

  const startVerification = trpc.trustclaw.startPhoneVerification.useMutation({
    onError: trpcToastOnError,
    onSuccess: () => {
      setAwaitingCode(true);
      showSuccessToast("Code sent. Check your texts.");
    },
  });
  const confirmVerification =
    trpc.trustclaw.confirmPhoneVerification.useMutation({
      onError: trpcToastOnError,
      onSuccess: () => {
        setAwaitingCode(false);
        setCode("");
        showSuccessToast("Number verified");
        void utils.trustclaw.getChannels.invalidate();
      },
    });

  if (isLoading) return <ChannelsClientSkeleton />;
  if (error || !data) {
    return (
      <div className="p-6">
        <ErrorDisplay
          message="Couldn't load channel settings."
          retryText="Try again"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const toggle = async (
    field: "presenceEnabled" | "eaSlackEnabled" | "eaSmsEnabled",
    value: boolean,
  ) => {
    try {
      await updateChannels.mutateAsync({ [field]: value });
      if (field === "presenceEnabled") {
        showSuccessToast(
          value
            ? "Presence on. The EA is live."
            : "Presence off. All proactive outreach is silenced.",
        );
      }
    } catch (err) {
      showTrpcErrorToast(err);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Channels</h1>
        <p className="text-muted-foreground text-sm">
          How your EA reaches you, and how you reach it, outside this app.
        </p>
      </div>

      <Card className={data.presenceEnabled ? "border-primary/50" : ""}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <Radio
              className={`h-5 w-5 ${data.presenceEnabled ? "text-primary" : "text-muted-foreground"}`}
            />
            <div>
              <CardTitle className="text-base">Presence Mode</CardTitle>
              <CardDescription>
                Master switch. Off silences every proactive nudge, brief, and
                ping instantly. Inbound still works.
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={data.presenceEnabled}
            disabled={updateChannels.isPending}
            onCheckedChange={(v) => void toggle("presenceEnabled", v)}
            aria-label="Presence Mode master switch"
          />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <MessageSquareText className="text-muted-foreground h-5 w-5" />
            <div>
              <CardTitle className="text-base">Slack, as you</CardTitle>
              <CardDescription>
                {data.slack.channelId
                  ? "Private #ea channel is set up. Nudges, briefs, and replies live there."
                  : "Sets up a private #ea channel in your Slack on enable."}
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={data.slack.enabled}
            disabled={updateChannels.isPending}
            onCheckedChange={(v) => void toggle("eaSlackEnabled", v)}
            aria-label="Slack channel toggle"
          />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <Smartphone className="text-muted-foreground h-5 w-5" />
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Text messages
                {!data.sms.configured && (
                  <Badge variant="outline">awaiting Twilio</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {data.sms.verified && data.sms.phoneNumber
                  ? `Verified: ${data.sms.phoneNumber}. Escalation pings and quick asks.`
                  : "Verify your number and the EA can text you what's overdue."}
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={data.sms.enabled}
            disabled={updateChannels.isPending || !data.sms.verified}
            onCheckedChange={(v) => void toggle("eaSmsEnabled", v)}
            aria-label="SMS channel toggle"
          />
        </CardHeader>
        {data.sms.configured && !data.sms.verified && (
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            {!awaitingCode ? (
              <>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+14155550132"
                  inputMode="tel"
                  className="sm:max-w-56"
                />
                <Button
                  disabled={startVerification.isPending || !phone}
                  onClick={() =>
                    void startVerification
                      .mutateAsync({ phoneNumber: phone.trim() })
                      .catch(() => undefined)
                  }
                >
                  <Send className="h-4 w-4" />
                  Text me a code
                </Button>
              </>
            ) : (
              <>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  className="sm:max-w-40"
                />
                <Button
                  disabled={confirmVerification.isPending || code.length !== 6}
                  onClick={() =>
                    void confirmVerification
                      .mutateAsync({ code: code.trim() })
                      .catch(() => undefined)
                  }
                >
                  Verify
                </Button>
              </>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardrails</CardTitle>
          <CardDescription>
            Enforced in code, on every channel at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            Quiet hours {data.guardrails.quietHours}
          </Badge>
          <Badge variant="secondary">
            Max {data.guardrails.maxDailyPings} pings/day
          </Badge>
          <Badge variant="secondary">
            Chase window {data.guardrails.chaseWindowHrs}h
          </Badge>
          <Badge variant="secondary">Brief {data.guardrails.briefTime}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
