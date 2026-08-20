import { create } from "zustand";

interface ChatDrawerState {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

// Bridges the navbar hamburger (in the layout) and the mobile drawer (in the
// chat page), which live in different parts of the tree.
export const useChatDrawerStore = create<ChatDrawerState>((set) => ({
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));
