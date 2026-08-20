"use client";

import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet";
import { ConversationSidebarContent } from "./conversation-sidebar";
import { PersonalityControl } from "./personality-control";
import { MemoryBucketControl } from "./memory-bucket-control";
import { useChatDrawerStore } from "./chat-drawer-store";

// Mobile-only slide-over: the conversation list + the per-message controls
// (personality, memory bucket, incognito) that are otherwise hidden behind md:.
export function ConversationDrawer() {
  const drawerOpen = useChatDrawerStore((s) => s.drawerOpen);
  const setDrawerOpen = useChatDrawerStore((s) => s.setDrawerOpen);

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="left"
        className="bg-sidebar w-[88%] max-w-xs gap-0 p-0"
      >
        <SheetTitle className="sr-only">Chats and controls</SheetTitle>
        <div className="border-sidebar-border flex flex-wrap items-center gap-1 border-b p-2 pt-12">
          <PersonalityControl />
          <MemoryBucketControl />
        </div>
        <div className="min-h-0 flex-1">
          <ConversationSidebarContent onNavigate={() => setDrawerOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
