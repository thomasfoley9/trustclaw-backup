import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TerminalState {
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  // Mobile bottom-sheet variant of the pane. Session-only (never persisted) so
  // the sheet can't pop open uninvited on page load.
  mobileTerminalOpen: boolean;
  setMobileTerminalOpen: (open: boolean) => void;
}

// Desktop open/closed persists across reloads (the pane's width already does,
// via use-persisted-panel-layout - the flag was the missing half). Hydration is
// deferred (skipHydration) and triggered from the navbar after mount: a
// synchronous localStorage read at store init would make the first client
// render disagree with SSR, and this page has a history of wedging on
// hydration mismatches.
export const useTerminalStore = create<TerminalState>()(
  persist(
    (set) => ({
      terminalOpen: true,
      setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
      mobileTerminalOpen: false,
      setMobileTerminalOpen: (mobileTerminalOpen) =>
        set({ mobileTerminalOpen }),
    }),
    {
      name: "trustclaw-terminal-open",
      partialize: (s) => ({ terminalOpen: s.terminalOpen }),
      skipHydration: true,
    },
  ),
);
