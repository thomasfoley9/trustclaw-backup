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
    <div className="bg-destructive/10 border-border border-b px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 md:flex-row md:items-center md:gap-3">
        <div className="text-destructive flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            No Anthropic API key set - chat is disabled until you add your own
            (your Claude usage bills to your account).
          </span>
        </div>
        <Link
          href="/dashboard/settings"
          className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/15 shrink-0 rounded-md border px-3 py-1 text-xs font-medium"
        >
          Add key
        </Link>
      </div>
    </div>
  );
}
