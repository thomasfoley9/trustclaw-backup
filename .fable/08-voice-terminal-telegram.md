# PR 08: Voice, terminal, Telegram

Branch: `fable/08-voice-terminal-telegram`
Base: `fable/07-performance`

## P0

- **Voice picker actually changes the voice.** `OPENAI_TO_SMALLEST` mapping (marin→avery, cedar→john, ash→robert, ballad→liam, coral→mia, sage→christine, alloy→quinn, echo→ronald, shimmer→poppy, verse→noah; pairings editorial by documented gender/tone, commented as such). Raw Smallest ids still resolve to themselves; unknown ids fall back to default. Settings + picker copy now truthfully says live calls use the OpenAI voice natively, read-aloud/Test use the mapped Smallest voice.
- **Dead call becomes a visible error.** Worker: missing OPENAI_API_KEY is fatal at boot for start/dev modes (build-time download-files still works), and per-call setup failure logs critical + closes the room. Client: 15s watchdog after room connect keyed on remote AUDIO TRACK subscription (a mis-keyed worker can join without publishing audio, so participant-join was too weak); tears down with a clear toast.
- **Hold music can't stick.** The voice-turn route flushes `status:"done"` for in-flight tools on every loop exit (abort included); the client also drains `runningToolsRef` when the agent starts speaking (agent speech = turn over).
- **Telegram failures message the user.** prepareAgentRun moved inside the guarded try; failures (including the no-Anthropic-key PRECONDITION_FAILED) send `parseAgentError(error)` to the chat; the outer catch also attempts a send.
- **Autoplay recovery.** NotAllowedError on read-aloud queues the loaded utterance behind a one-time pointerdown/keydown listener (generation-token-guarded) with a one-time toast: "Tap anywhere to enable audio."

## P1

- Sidebar toasts when a chat switch or New-chat ends a live call (tiny zustand bridge store; chose toast over blocking confirm since the plumbing was cheap).
- The call pill derives Muted/Speaking/Thinking/Listening from LiveKit's real AgentState + running cockpit tools instead of hardcoding listening.
- Terminal log capped at 200 entries with "Show older (n)": VirtualizedList owns its own scroll container and absolute-positions rows, which would break bottom-pinning, the tool-focus scrollIntoView, and the shared scroll handler.
- The terminal toggle is visible on phones (opens the Sheet; pane on desktop) and terminalOpen persists via zustand persist with skipHydration (rehydrated post-mount to avoid the page's known hydration-mismatch history).
- Redis-less deploys log a once-per-process warning that Telegram dedup and supersede-abort are disabled.
- Leaks fixed: voice-call grace timer cleared on unmount; terminal timestampCache LRU-capped at 500; voice-settings Test revokes the prior blob URL before minting a new one and on unmount.

## Acceptance

- [x] Picked voice changes read-aloud TTS
- [x] Dead worker surfaces within ~15s
- [x] Hold music bounded by its turn
- [x] Telegram no-key case messages the user
- [x] NotAllowedError recovers on next gesture
- [x] pnpm typecheck + lint clean; agent.py compiles

Dependencies added: none.
