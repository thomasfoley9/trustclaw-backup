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

  if (pathname?.startsWith("/dashboard/settings")) return null;
  if (!data || data.hasKey) return null;

  return (
    <div className="border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950/30">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span>
            No Composio API key set — tools and integrations are disabled
            until you add one.
          </span>
        </div>
        <Link
          href="/dashboard/settings"
          className="shrink-0 rounded-md border border-amber-700/30 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:border-amber-300/30 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
        >
          Add key
        </Link>
      </div>
    </div>
  );
}
