"use client";

import { useEffect, useRef, useState } from "react";
import { Room } from "livekit-client";
import {
  RoomContext,
  RoomAudioRenderer,
  useDataChannel,
  useTranscriptions,
  useLocalParticipant,
} from "@livekit/components-react";
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
  onEnded,
  onCockpitEvent,
  onTranscript,
}: VoiceCallProps) {
  const [room] = useState(() => new Room());
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    // Guard against a late 'disconnected' firing after cleanup (room.disconnect
    // is fire-and-forget), which would call onEnded on an unmounted parent.
    const onDisconnected = () => {
      if (!cancelled) onEndedRef.current();
    };
    room.on("disconnected", onDisconnected);

    void (async () => {
      try {
        const res = await fetch("/api/livekit-token", { method: "POST" });
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
        await room.connect(data.serverUrl, data.token);
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        showErrorToast("Couldn't connect the call.");
        if (!cancelled) onEndedRef.current();
      }
    })();

    return () => {
      cancelled = true;
      room.off("disconnected", onDisconnected);
      void room.disconnect();
    };
  }, [active, room]);

  if (!active) return null;

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      <CockpitBridge onCockpitEvent={onCockpitEvent} />
      <TranscriptBridge onTranscript={onTranscript} />
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
