"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  Menu,
  MessageCircle,
  PanelRight,
  Puzzle,
  Settings,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { ThemeToggle } from "~/components/core/theme-toggle";
import { TrustClawBrand } from "~/app/_components/trustclaw-brand";
import { trpc } from "~/clients/trpc";
import { authClient } from "~/clients/auth/react";
import { useIsMobile } from "~/lib/use-is-mobile";
import { useTerminalStore } from "./terminal-store";
import { useChatDrawerStore } from "./chat-drawer-store";
import { MemoryBucketControl } from "./memory-bucket-control";
import { PersonalityControl } from "./personality-control";

export function DashboardNavbar() {
  const pathname = usePathname();
  const isChat = pathname === "/dashboard";
  const isSettings = pathname.startsWith("/dashboard/settings");
  const isToolkits = pathname.startsWith("/dashboard/toolkits");
  const terminalOpen = useTerminalStore((s) => s.terminalOpen);
  const setTerminalOpen = useTerminalStore((s) => s.setTerminalOpen);
  const mobileTerminalOpen = useTerminalStore((s) => s.mobileTerminalOpen);
  const setMobileTerminalOpen = useTerminalStore(
    (s) => s.setMobileTerminalOpen,
  );
  const setDrawerOpen = useChatDrawerStore((s) => s.setDrawerOpen);
  // On phones the desktop pane is display:none, so the toggle drives the
  // bottom Sheet instead (same split as chat-view's handleOpenTerminal).
  const isMobile = useIsMobile();
  // Restore the persisted desktop open/closed flag AFTER hydration (the store
  // uses skipHydration - see terminal-store.ts). The navbar is mounted on
  // every dashboard page, so this runs exactly once per load.
  useEffect(() => {
    void useTerminalStore.persist.rehydrate();
  }, []);
  // The mobile drawer only exists on the full chat page. During onboarding
  // and the Composio activation gate the hamburger would be a dead button
  // whose stale open state pops the drawer once the gates clear. Both queries
  // are already warm from the layout banners.
  const { data: status } = trpc.trustclaw.getStatus.useQuery();
  const { data: composioKey } = trpc.trustclaw.getComposioKeyStatus.useQuery();
  const drawerExists = !!status?.hasInstance && !!composioKey?.hasKey;
  const router = useRouter();
  const activityOpen = isMobile ? mobileTerminalOpen : terminalOpen;
  const handleToggleTerminal = () => {
    if (isMobile) setMobileTerminalOpen(!mobileTerminalOpen);
    else setTerminalOpen(!terminalOpen);
  };

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <header className="border-sidebar-border bg-background/70 supports-[backdrop-filter]:bg-background/60 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-1">
        {isChat && drawerExists && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open chats and controls"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <TrustClawBrand size="sm" logoLink="/dashboard" />
      </div>

      <nav aria-label="Primary" className="flex items-center gap-1">
        {isChat && (
          <div className="hidden items-center gap-1 md:flex">
            <PersonalityControl />
            <MemoryBucketControl />
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Chat"
              className={`h-10 w-10 ${isChat ? "bg-primary/15 text-primary" : ""}`}
            >
              <Link href="/dashboard">
                <MessageCircle className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Chat</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Toolkits"
              className={`h-10 w-10 ${isToolkits ? "bg-primary/15 text-primary" : ""}`}
            >
              <Link href="/dashboard/toolkits">
                <Puzzle className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toolkits</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Settings"
              className={`h-10 w-10 ${isSettings ? "bg-primary/15 text-primary" : ""}`}
            >
              <Link href="/dashboard/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        {isChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={activityOpen ? "Hide activity panel" : "Show activity panel"}
                className={`h-10 w-10 ${activityOpen ? "bg-primary/15 text-primary" : ""}`}
                onClick={handleToggleTerminal}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {activityOpen ? "Hide" : "Show"} Terminal
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <ThemeToggle />
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Log out"
              className="h-10 w-10"
              onClick={() => handleLogout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Logout</TooltipContent>
        </Tooltip>
      </nav>
    </header>
  );
}
