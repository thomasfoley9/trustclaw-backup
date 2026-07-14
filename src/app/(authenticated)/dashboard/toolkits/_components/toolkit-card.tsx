"use client";

import { useState } from "react";
import { Unplug } from "lucide-react";
import { Button } from "~/components/ui/button";
import { trpc } from "~/clients/trpc";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { AlertDialog } from "~/components/core/confirm-dialog";
import { useToolkitConnect } from "./use-toolkit-connect";
import type { RouterOutputs } from "~/clients/trpc";
import { Spinner } from "~/components/ui/spinner";

type ToolkitItem = RouterOutputs["toolkits"]["getToolkits"]["items"][number];

interface ToolkitCardProps {
  toolkit: ToolkitItem;
}

export function ToolkitCard({ toolkit }: ToolkitCardProps) {
  const [logoLoaded, setLogoLoaded] = useState(false);

  const utils = trpc.useUtils();
  const { connect, isMinting, isWaiting } = useToolkitConnect(
    toolkit.slug,
    toolkit.name,
  );

  const disconnect = trpc.toolkits.disconnect.useMutation({
    onSuccess: () => {
      showSuccessToast(`${toolkit.name} disconnected`);
      void utils.toolkits.getToolkits.invalidate();
    },
    onError: trpcToastOnError,
  });

  const isConnected = toolkit.connected || toolkit.noAuth;
  const statusLabel = toolkit.connected
    ? "Connected"
    : toolkit.noAuth
      ? "Active"
      : null;

  return (
    <article
      className="toolkit-card group outline-border bg-card relative rounded-xl border-[2px] border-transparent outline outline-1"
      style={{ containerType: "size", aspectRatio: "1" }}
    >
      {/* Inner container with clip for glow containment */}
      <div className="absolute inset-0 overflow-hidden rounded-xl [clip-path:inset(0_round_12px)]">
        {/* Blurred glow copy of logo */}
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center will-change-transform"
          style={{
            filter: "url(#toolkit-blur) saturate(5) brightness(1.3)",
            translate:
              "calc(var(--pointer-x, -10) * 50cqi) calc(var(--pointer-y, -10) * 50cqh)",
            scale: "3.4",
            opacity: 0.25,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external SVG from logos.composio.dev */}
          <img
            src={toolkit.logo}
            alt=""
            className="h-16 w-16"
            draggable={false}
          />
        </div>

        {/* Card content */}
        <div className="relative z-[2] flex h-full flex-col items-center justify-center gap-1.5 p-4 pt-10">
          {/* Top-right: status badge (+ disconnect) or connect button */}
          <div className="absolute right-3 top-3 z-[1] flex items-center gap-1">
            {isConnected ? (
              <>
                <span className="bg-chart-2/15 text-chart-2 rounded-full px-2 py-0.5 text-xs font-medium">
                  {statusLabel}
                </span>
                {/* noAuth toolkits have no connected account to remove */}
                {toolkit.connected && (
                  <AlertDialog
                    title={`Disconnect ${toolkit.name}?`}
                    description={`Your agent immediately loses access to ${toolkit.name} and the stored authorization is revoked. You can reconnect any time.`}
                    confirmLabel="Disconnect"
                    onConfirm={async () => {
                      await disconnect
                        .mutateAsync({ toolkit: toolkit.slug })
                        .catch(() => undefined);
                    }}
                    isPending={disconnect.isPending}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-6 w-6"
                        disabled={disconnect.isPending}
                        aria-label={`Disconnect ${toolkit.name}`}
                        title={`Disconnect ${toolkit.name}`}
                      >
                        {disconnect.isPending ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <Unplug className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    }
                  />
                )}
              </>
            ) : isWaiting ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-7 px-2 text-xs"
                onClick={() => void connect()}
                title="Reopen the connection window"
              >
                <Spinner size="sm" className="mr-1" />
                Waiting...
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs transition-all duration-base ease-out-quad group-hover:-translate-y-px group-hover:shadow-md active:translate-y-0 active:brightness-95"
                onClick={(e) => {
                  e.stopPropagation();
                  void connect();
                }}
                disabled={isMinting}
              >
                {isMinting ? "Connecting..." : "Connect"}
              </Button>
            )}
          </div>

          {/* Sharp logo */}
          {/* eslint-disable-next-line @next/next/no-img-element -- external SVG from logos.composio.dev */}
          <img
            src={toolkit.logo}
            alt={`${toolkit.name} logo`}
            className="h-12 w-12 select-none transition-opacity duration-slow ease-out-quad"
            style={{ opacity: logoLoaded ? 1 : 0 }}
            onLoad={() => setLogoLoaded(true)}
            draggable={false}
          />

          {/* Name */}
          <h3 className="select-none text-sm font-semibold text-foreground">
            {toolkit.name}
          </h3>


        </div>
      </div>

      {/* Frosted glass border effect - uses longhands to prevent mask shorthand from resetting maskComposite */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] rounded-xl [clip-path:inset(0_round_12px)]"
        style={{
          border: "2px solid transparent",
          backdropFilter: "saturate(4.2) brightness(2.5) contrast(2.5)",
          maskImage:
            "linear-gradient(#fff 0 100%), linear-gradient(#fff 0 100%)",
          maskOrigin: "border-box, padding-box",
          maskClip: "border-box, padding-box",
          maskComposite: "exclude",
          WebkitMaskImage:
            "linear-gradient(#fff 0 100%), linear-gradient(#fff 0 100%)",
          WebkitMaskOrigin: "border-box, padding-box",
          WebkitMaskClip: "border-box, padding-box",
          WebkitMaskComposite: "xor",
        }}
      />
    </article>
  );
}
