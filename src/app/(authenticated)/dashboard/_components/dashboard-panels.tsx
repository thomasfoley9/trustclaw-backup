"use client";

import type { ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { usePersistedPanelLayout } from "~/lib/use-persisted-panel-layout";

// Desktop: sidebar | chat with a draggable divider (width persisted). On
// mobile the sidebar panel and handle are display:none - the drawer covers
// small screens - and the chat panel is the only visible flex item, so it
// fills the row regardless of the saved percentages.
export function DashboardPanels({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const { groupRef, onLayoutChanged } = usePersistedPanelLayout(
    "trustclaw-panels-dashboard",
  );

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      groupRef={groupRef}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0"
    >
      <ResizablePanel
        id="sidebar"
        defaultSize="256px"
        minSize="200px"
        maxSize="480px"
        // className lands on the panel's INNER div; hiding on mobile must hit
        // the outer element via data-mobile-hidden (see globals.css).
        data-mobile-hidden=""
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle className="hidden md:flex" />
      <ResizablePanel id="chat" className="min-w-0">
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
