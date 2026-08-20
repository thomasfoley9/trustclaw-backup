import { create } from "zustand";

interface VoiceCallState {
  liveCallActive: boolean;
  setLiveCallActive: (active: boolean) => void;
}

// Bridges the chat view (which owns the LiveKit call) and the conversation
// sidebar (a different part of the tree): switching chats remounts the chat
// view and silently kills the call, so the sidebar reads this flag to warn
// the user when a switch is about to end one.
export const useVoiceCallStore = create<VoiceCallState>((set) => ({
  liveCallActive: false,
  setLiveCallActive: (liveCallActive) => set({ liveCallActive }),
}));
