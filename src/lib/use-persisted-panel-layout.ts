"use client";

import { useCallback, useEffect, useRef } from "react";
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels";

// Persist resizable-panel layouts to localStorage. The saved layout is applied
// AFTER mount via the group's imperative handle, so server and client both
// render the defaultSize layout first - this page previously wedged on
// hydration mismatches (see the prefetching NOTE in dashboard/page.tsx), so
// layout must never differ between the two renders.
export function usePersistedPanelLayout(storageKey: string) {
  const groupRef = useRef<GroupImperativeHandle | null>(null);

  // Also called when a conditionally-rendered panel (the cockpit) remounts:
  // a mount-time apply that ran while the panel was absent silently dropped
  // its share, so reopening must re-apply the stored layout.
  const applyStoredLayout = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const layout = JSON.parse(raw) as Layout;
      if (layout && typeof layout === "object" && !Array.isArray(layout)) {
        groupRef.current?.setLayout(layout);
      }
    } catch {
      // Corrupt saved layout - keep the defaults.
    }
  }, [storageKey]);

  useEffect(() => {
    applyStoredLayout();
  }, [applyStoredLayout]);

  const onLayoutChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      // Only persist drags the user made, not programmatic/resize reflows.
      if (!meta.isUserInteraction) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(layout));
      } catch {
        // Storage blocked or full - resizing still works, just not remembered.
      }
    },
    [storageKey],
  );

  return { groupRef, onLayoutChanged, applyStoredLayout };
}
