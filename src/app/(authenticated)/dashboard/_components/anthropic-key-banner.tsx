"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { trpc } from "~/clients/trpc";

export function AnthropicKeyBanner() {
  const pathname = usePathname();
  const { data } = trpc.trustclaw.getAnthropicKeyStatus.useQuery(undefined, {
    refetchOnWindowFocus: "always",
  });

  if (pathname?.startsWith("/dashboard/settings")) return null;
  if (!data || data.hasKey) return null;

  return (
    <div className="border-b bg-rose-50 px-4 py-2 text-sm dark:bg-rose-950/30">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            No Anthropic API key set — chat is disabled until you add your own
            (your Claude usage bills to your account).
          </span>
        </div>
        <Link
          href="/dashboard/settings"
          className="shrink-0 rounded-md border border-rose-700/30 bg-rose-100 px-3 py-1 text-xs font-medium text-rose-900 hover:bg-rose-200 dark:border-rose-300/30 dark:bg-rose-900/50 dark:text-rose-100 dark:hover:bg-rose-900/70"
        >
          Add key
        </Link>
      </div>
    </div>
  );
}
