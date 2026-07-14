"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Copy, ExternalLink, MessageSquare, Unlink } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { AlertDialog } from "~/components/core/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { Spinner } from "~/components/ui/spinner";

export function TelegramSettings() {
  const [commandCopied, setCommandCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const utils = trpc.useUtils();

  // Cleanup the "copied" indicator timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const linkTelegram = trpc.trustclaw.linkTelegram.useMutation({
    onError: trpcToastOnError,
  });

  const telegramToken = linkTelegram.data?.token ?? null;
  const botUsername = linkTelegram.data?.botUsername ?? null;
  const tokenExpiresAt = linkTelegram.data?.expiresAt ?? null;

  // Flip to the expired state when the link token's TTL passes, so the poll
  // stops and the user isn't left staring at a stale /start command forever.
  const [linkExpired, setLinkExpired] = useState(false);
  useEffect(() => {
    if (!tokenExpiresAt) {
      setLinkExpired(false);
      return;
    }
    const remainingMs = tokenExpiresAt.getTime() - Date.now();
    if (remainingMs <= 0) {
      setLinkExpired(true);
      return;
    }
    setLinkExpired(false);
    const timer = setTimeout(() => setLinkExpired(true), remainingMs);
    return () => clearTimeout(timer);
  }, [tokenExpiresAt]);

  // Single source of truth: the instance query. Poll while we're waiting for
  // the user to send /start to BotFather; otherwise just read the steady-state
  // value. Derive isLinked directly from the query so we don't have to mirror
  // server state into local useState (the prior implementation did and needed
  // a useEffect to keep the two in sync - classic anti-pattern).
  const { data: instanceData } = trpc.trustclaw.getInstance.useQuery(undefined, {
    refetchInterval: telegramToken && !linkExpired ? 3000 : false,
  });
  const isLinked = !!instanceData?.instance?.telegramChatId;

  // When the link finally completes, surface a toast and clear the pending
  // token so the UI flips to the linked state.
  useEffect(() => {
    if (isLinked && telegramToken) {
      showSuccessToast("Telegram linked successfully!");
      linkTelegram.reset();
    }
  }, [isLinked, telegramToken, linkTelegram]);

  const unlinkTelegram = trpc.trustclaw.unlinkTelegram.useMutation({
    onSuccess: () => {
      showSuccessToast("Telegram unlinked");
      linkTelegram.reset();
      void utils.trustclaw.getInstance.invalidate();
    },
    onError: trpcToastOnError,
  });

  const handleCopyCommand = useCallback(async () => {
    if (!telegramToken) return;
    await navigator.clipboard.writeText(`/start ${telegramToken}`);
    setCommandCopied(true);
    showSuccessToast("Copied to clipboard!");
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCommandCopied(false), 2000);
  }, [telegramToken]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Chat with Claw from Telegram - messages sync with the
          dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLinked ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Connected to Telegram</span>
              <Badge variant="secondary">Linked</Badge>
            </div>
            <AlertDialog
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unlinkTelegram.isPending}
                >
                  {unlinkTelegram.isPending ? (
                    <Spinner className="mr-2" />
                  ) : (
                    <Unlink className="mr-2 h-4 w-4" />
                  )}
                  Unlink
                </Button>
              }
              title="Unlink Telegram"
              description="This will disconnect Telegram from your Claw instance. You can re-link it later."
              confirmLabel="Unlink"
              onConfirm={() =>
                void unlinkTelegram.mutateAsync().catch(() => undefined)
              }
              isPending={unlinkTelegram.isPending}
            />
          </div>
        ) : telegramToken && botUsername && linkExpired ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Link expired - generate a new link to connect Telegram.
            </p>
            <Button
              variant="outline"
              onClick={() => void linkTelegram.mutateAsync().catch(() => undefined)}
              disabled={linkTelegram.isPending}
            >
              {linkTelegram.isPending ? (
                <>
                  <Spinner className="mr-2" />
                  Generating link...
                </>
              ) : (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Generate a new link
                </>
              )}
            </Button>
          </div>
        ) : telegramToken && botUsername ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send this command to{" "}
              <Link
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                @{botUsername}
                <ExternalLink className="h-3 w-3" />
              </Link>{" "}
              on Telegram:
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-sm">
                /start {telegramToken}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCommand}
                className="shrink-0"
              >
                {commandCopied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Spinner />
                Waiting for Telegram link...
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => linkTelegram.reset()}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => void linkTelegram.mutateAsync().catch(() => undefined)}
            disabled={linkTelegram.isPending}
          >
            {linkTelegram.isPending ? (
              <>
                <Spinner className="mr-2" />
                Generating link...
              </>
            ) : (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Link Telegram
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
