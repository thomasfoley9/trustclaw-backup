"use client";

import { useEffect, useRef, useState } from "react";
import { Room } from "livekit-client";
import {
  RoomContext,
  RoomAudioRenderer,
  useDataChannel,
} from "@livekit/components-react";
import { showErrorToast } from "~/components/core/toast-notifications";

// A live Agent B tool event forwarded from the LiveKit worker's cockpit channel.
export interface VoiceCockpitEvent {
  type: "b_tool";
  name: string;
  status: "running" | "done";
}

interface VoiceCallProps {
  active: boolean;
  // Called when the session ends (disconnect, error, or token failure) so the
  // parent can flip the call button back off.
  onEnded: () => void;
  // Live Agent B tool activity → the cockpit pane.
  onCockpitEvent?: (event: VoiceCockpitEvent) => void;
}

// Real-time voice: connects the browser to the user's LiveKit room (token minted
// server-side at /api/livekit-token, which also dispatches the Agent A worker),
// publishes the mic, and plays the agent's audio. Replaces the browser Web Speech
// loop on the real-time path. Renders nothing visible itself — audio + a hidden
// cockpit-data bridge.
export function VoiceCall({ active, onEnded, onCockpitEvent }: VoiceCallProps) {
  const [room] = useState(() => new Room());
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const onDisconnected = () => onEndedRef.current();
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
    </RoomContext.Provider>
  );
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
      if (parsed?.type === "b_tool") onCockpitEvent(parsed);
    } catch {
      // ignore malformed cockpit payloads
    }
  });
  return null;
}
