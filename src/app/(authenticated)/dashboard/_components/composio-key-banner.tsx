"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";
import { trpc } from "~/clients/trpc";

export function ComposioKeyBanner() {
  const pathname = usePathname();
  const { data } = trpc.trustclaw.getComposioKeyStatus.useQuery(undefined, {
    refetchOnWindowFocus: "always",
  });
  const { data: status } = trpc.trustclaw.getStatus.useQuery();

  if (pathname?.startsWith("/dashboard/settings")) return null;
  // The /dashboard route owns the full-page activation gate when the Composio
  // key is missing; a second banner with the same ask above it is noise.
  if (pathname === "/dashboard") return null;
  // No instance yet = still onboarding; don't cover the wizard.
  if (!status?.hasInstance) return null;
  if (!data || data.hasKey) return null;

  return (
    <div className="bg-chart-4/10 border-border border-b px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 md:flex-row md:items-center md:gap-3">
        <div className="text-foreground flex items-center gap-2">
          <KeyRound className="text-chart-4 h-4 w-4 shrink-0" />
          <span>
            No Composio API key set - tools and integrations are disabled until
            you add one.
          </span>
        </div>
        <Link
          href="/dashboard/settings"
          className="border-chart-4/30 bg-chart-4/15 text-foreground hover:bg-chart-4/25 shrink-0 rounded-md border px-3 py-1 text-xs font-medium"
        >
          Add key
        </Link>
      </div>
    </div>
  );
}
