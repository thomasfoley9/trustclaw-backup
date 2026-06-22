"use client";

import { useEffect, useRef, useState } from "react";
import { Room, ConnectionState, RoomEvent } from "livekit-client";
import {
  RoomContext,
  RoomAudioRenderer,
  useDataChannel,
  useTranscriptions,
  useLocalParticipant,
} from "@livekit/components-react";
import { Volume2 } from "lucide-react";
import { showErrorToast } from "~/components/core/toast-notifications";

// A live Agent B tool event forwarded from the LiveKit worker's cockpit channel.
export interface VoiceCockpitEvent {
  type: "b_tool";
  // toolCallId from Agent B — stable key so running→done updates in place.
  id: string;
  name: string;
  status: "running" | "done";
  // The tool's input args (Composio call payload), shown in the Receipts view.
  args?: Record<string, unknown>;
}

// One line of the live call transcript (your speech or Claw's reply).
export interface VoiceTranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface VoiceCallProps {
  active: boolean;
  // When true, the local mic track is disabled so the agent hears nothing.
  muted: boolean;
  // Called when the session ends (disconnect, error, or token failure) so the
  // parent can flip the call button back off.
  onEnded: () => void;
  // Live Agent B tool activity → the cockpit pane.
  onCockpitEvent?: (event: VoiceCockpitEvent) => void;
  // Live STT/TTS transcript of the call → the chat message list.
  onTranscript?: (entries: VoiceTranscriptEntry[]) => void;
}

// Real-time voice: connects the browser to the user's LiveKit room (token minted
// server-side at /api/livekit-token, which also dispatches the Agent A worker),
// publishes the mic, and plays the agent's audio. Replaces the browser Web Speech
// loop on the real-time path. Renders nothing visible itself — audio + a hidden
// cockpit-data bridge.
export function VoiceCall({
  active,
  muted,
  onEnded,
  onCockpitEvent,
  onTranscript,
}: VoiceCallProps) {
  // A fresh Room is created per call (in the connect effect) and held here so
  // the RoomContext + audio renderer can read it. Reusing ONE Room across
  // start/stop cycles let a new connect() race a prior teardown on the same
  // object — the source of duplicate / overlapping sessions on re-click. Null
  // between calls.
  const [room, setRoom] = useState<Room | null>(null);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!active) {
      setRoom(null);
      return;
    }
    // One clean Room object for the lifetime of THIS call. Disconnected and
    // discarded on teardown so the next call starts from a pristine object.
    const liveRoom = new Room();
    setRoom(liveRoom);
    let cancelled = false;
    // Abort an in-flight token request on teardown so a quick start->stop can't
    // leave the server having minted a token + dispatched an Agent A for a call
    // the client already abandoned (the orphaned-session path the fresh Room
    // alone doesn't cover, since the dispatch is a server side effect).
    const tokenAbort = new AbortController();

    // Guard against a late 'disconnected' firing after cleanup (room.disconnect
    // is fire-and-forget), which would call onEnded on an unmounted parent.
    const onDisconnected = () => {
      if (!cancelled) onEndedRef.current();
    };
    liveRoom.on("disconnected", onDisconnected);

    void (async () => {
      try {
        const res = await fetch("/api/livekit-token", {
          method: "POST",
          signal: tokenAbort.signal,
        });
        if (!res.ok) {
          showErrorToast(
            res.status === 412
              ? "Voice isn't configured yet."
              : "Couldn't start the call.",
          );
          if (!cancelled) onEndedRef.current();
          return;
        }
        const data = (await res.json()) as {
          serverUrl: string;
          token: string;
        };
        if (cancelled) return;

        // Split the two failure modes so the surfaced error is precise: the room
        // connection (network / WebRTC) vs. the mic grant (getUserMedia — the
        // usual mobile/iOS culprit, which needs HTTPS + a permission grant).
        try {
          await liveRoom.connect(data.serverUrl, data.token);
        } catch (err) {
          const detail =
            err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          console.error("[voice] room.connect failed —", detail);
          showErrorToast(
            "Couldn't connect the call — check your connection and try again.",
          );
          if (!cancelled) onEndedRef.current();
          return;
        }
        if (cancelled) return;

        try {
          await liveRoom.localParticipant.setMicrophoneEnabled(true);
        } catch (err) {
          const name = err instanceof Error ? err.name : "";
          const detail =
            err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          console.error("[voice] microphone enable failed —", detail);
          showErrorToast(
            name === "NotAllowedError" || name === "SecurityError"
              ? "Microphone access was blocked. Allow mic access for this site, then try again."
              : name === "NotFoundError"
                ? "No microphone was found on this device."
                : "Couldn't turn on your microphone — try again.",
          );
          if (!cancelled) onEndedRef.current();
          return;
        }

        // Unlock audio playback. Mobile browsers (and Safari) block autoplay
        // until a gesture-initiated startAudio, so the agent's voice wouldn't be
        // heard otherwise. Best-effort — RoomAudioRenderer also handles it.
        void liveRoom.startAudio().catch(() => undefined);
      } catch (err) {
        // An aborted token fetch is an intentional teardown, not a failure —
        // stay silent and let the cleanup path own it.
        if (tokenAbort.signal.aborted) return;
        const detail =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error("[voice] call setup failed —", detail);
        showErrorToast("Couldn't connect the call.");
        if (!cancelled) onEndedRef.current();
      }
    })();

    return () => {
      cancelled = true;
      tokenAbort.abort();
      liveRoom.off("disconnected", onDisconnected);
      void liveRoom.disconnect();
      // No setRoom(null) here: the next effect pass handles it (the !active
      // branch nulls it; a re-activate replaces it), avoiding a null flap that
      // would briefly tear down the audio renderer + data bridges.
    };
  }, [active]);

  // Reflect the mute button onto the published mic track. The connect effect
  // enables the mic on join (unmuted); this responds to later toggles. Guarded
  // on connection state so it never races the initial connect.
  useEffect(() => {
    if (room?.state !== ConnectionState.Connected) return;
    void room.localParticipant
      .setMicrophoneEnabled(!muted)
      .catch((err) => console.error("[voice] mute toggle failed —", err));
  }, [muted, room]);

  // Mobile/Safari (and often desktop Chrome) block audio autoplay until a user
  // gesture. The after-connect startAudio() runs outside the tap, so it can be
  // blocked — surface a tap-to-enable button that calls startAudio inside a real
  // gesture (the reliable path on every platform). Re-check canPlaybackAudio on
  // EVERY relevant trigger so the button can't silently fail to appear if one
  // browser doesn't emit AudioPlaybackStatusChanged.
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  useEffect(() => {
    if (!room) return;
    const sync = () => setNeedsAudioUnlock(!room.canPlaybackAudio);
    room.on(RoomEvent.AudioPlaybackStatusChanged, sync);
    room.on(RoomEvent.TrackSubscribed, sync);
    room.on(RoomEvent.Connected, sync);
    sync();
    // Belt-and-suspenders: re-check after the greeting would have arrived, in
    // case no event fired on this browser.
    const t = setTimeout(sync, 4000);
    return () => {
      clearTimeout(t);
      room.off(RoomEvent.AudioPlaybackStatusChanged, sync);
      room.off(RoomEvent.TrackSubscribed, sync);
      room.off(RoomEvent.Connected, sync);
    };
  }, [room]);

  if (!active || !room) return null;

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      <CockpitBridge onCockpitEvent={onCockpitEvent} />
      <TranscriptBridge onTranscript={onTranscript} />
      {needsAudioUnlock && (
        <button
          type="button"
          onClick={() => {
            void room
              .startAudio()
              .finally(() => setNeedsAudioUnlock(!room.canPlaybackAudio));
          }}
          className="bg-primary text-primary-foreground fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
        >
          <Volume2 className="size-4" />
          Tap to enable sound
        </button>
      )}
    </RoomContext.Provider>
  );
}

// Reads LiveKit transcription text streams (agent STT/TTS) and hands them up as
// {role, text} lines so the chat can render the live conversation. Identity ===
// the local participant means it's the user speaking; anything else is Claw.
function TranscriptBridge({
  onTranscript,
}: {
  onTranscript?: (entries: VoiceTranscriptEntry[]) => void;
}) {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  const localIdentity = localParticipant?.identity;
  useEffect(() => {
    if (!onTranscript) return;
    onTranscript(
      transcriptions.map(
        (t): VoiceTranscriptEntry => ({
          id: t.streamInfo.id,
          role:
            t.participantInfo.identity === localIdentity ? "user" : "assistant",
          text: t.text,
        }),
      ),
    );
  }, [transcriptions, localIdentity, onTranscript]);
  return null;
}

// Decodes the worker's 'cockpit' data-channel messages (Agent B tool events) and
// hands them up so the existing cockpit pane can render them live during a call.
function CockpitBridge({
  onCockpitEvent,
}: {
  onCockpitEvent?: (event: VoiceCockpitEvent) => void;
}) {
  useDataChannel("cockpit", (msg) => {
    if (!onCockpitEvent) return;
    try {
      const parsed = JSON.parse(
        new TextDecoder().decode(msg.payload),
      ) as VoiceCockpitEvent;
      // Fall back to the tool name as the key for older events without an id.
      if (parsed?.type === "b_tool") {
        onCockpitEvent({ ...parsed, id: parsed.id ?? parsed.name });
      }
    } catch {
      // ignore malformed cockpit payloads
    }
  });
  return null;
}
