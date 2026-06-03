"use client";

import type { CSSProperties } from "react";

// Avatars are authored at 200x200 (CSS art) and scaled to `size`.
const ART = 200;

export const PERSONALITY_AVATARS = [
  { key: "blue-blob", label: "Blue Blob" },
  { key: "derpy-green", label: "Derpy Green" },
  { key: "cyclops-pink", label: "Cyclops Pink" },
  { key: "angry-chunk", label: "Angry Chunk" },
] as const;

export type PersonalityAvatarKey = (typeof PERSONALITY_AVATARS)[number]["key"];

const abs: CSSProperties = { position: "absolute" };

function BlueBlob() {
  return (
    <>
      <div style={{ ...abs, top: -15, left: 35, width: 80, height: 30, background: "#4a2f13", borderRadius: "20px 50px 0 0", transform: "rotate(-10deg)" }} />
      <div style={{ ...abs, top: 30, left: 25, width: 150, height: 140, background: "#1a4cb0", borderRadius: "50% 50% 45% 45%" }}>
        <div style={{ ...abs, top: 40, left: 35, width: 35, height: 35, background: "#fff", borderRadius: "50%", border: "3px solid #000" }}>
          <div style={{ ...abs, top: 10, left: 10, width: 15, height: 15, background: "#000", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 40, right: 35, width: 35, height: 35, background: "#fff", borderRadius: "50%", border: "3px solid #000" }}>
          <div style={{ ...abs, top: 10, left: 10, width: 15, height: 15, background: "#000", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 80, left: 60, width: 30, height: 12, background: "#111", borderRadius: 3 }} />
      </div>
      <div style={{ ...abs, top: 80, left: -15, width: 30, height: 30, border: "6px solid #1a4cb0", borderRightColor: "transparent", borderRadius: "50%", transform: "rotate(45deg)" }} />
      <div style={{ ...abs, top: 80, right: -15, width: 30, height: 30, border: "6px solid #1a4cb0", borderRightColor: "transparent", borderRadius: "50%", transform: "rotate(-135deg)" }} />
    </>
  );
}

function DerpyGreen() {
  return (
    <>
      <div style={{ ...abs, top: -20, left: 45, width: 40, height: 40, background: "#ff5722", clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }} />
      <div style={{ ...abs, top: 25, left: 35, width: 130, height: 150, background: "#388e3c", borderRadius: "40% 40% 50% 50%" }}>
        <div style={{ ...abs, top: 30, left: 25, width: 40, height: 40, background: "#fff", borderRadius: "50%", border: "2px solid #000" }}>
          <div style={{ ...abs, top: "30%", left: "30%", width: 8, height: 8, background: "#000", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 35, right: 25, width: 25, height: 25, background: "#fff", borderRadius: "50%", border: "2px solid #000" }}>
          <div style={{ ...abs, top: "30%", left: "30%", width: 8, height: 8, background: "#000", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 75, left: 45, width: 40, height: 15, background: "#212121", clipPath: "polygon(0 0, 100% 0, 80% 100%, 20% 100%)" }} />
      </div>
      <div style={{ ...abs, top: 90, left: -5, width: 25, height: 25, border: "5px solid #388e3c", borderBottomColor: "transparent", borderRadius: "50%", transform: "rotate(60deg)" }} />
      <div style={{ ...abs, top: 90, right: -5, width: 25, height: 25, border: "5px solid #388e3c", borderBottomColor: "transparent", borderRadius: "50%", transform: "rotate(-60deg)" }} />
    </>
  );
}

function CyclopsPink() {
  return (
    <>
      <div style={{ ...abs, top: -10, left: 20, width: 100, height: 20, background: "#7e57c2", borderRadius: 10 }} />
      <div style={{ ...abs, top: 40, left: 30, width: 140, height: 130, background: "#ec407a", borderRadius: "50px 50px 30px 30px" }}>
        <div style={{ ...abs, top: 25, left: 45, width: 50, height: 50, background: "#fff", border: "4px solid #000", borderRadius: "50%" }}>
          <div style={{ ...abs, top: 15, left: 15, width: 16, height: 16, background: "#d32f2f", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 80, left: 55, width: 30, height: 10, background: "#000", borderRadius: "5px 5px 0 0" }} />
      </div>
      <div style={{ ...abs, top: 75, left: -15, width: 35, height: 20, border: "6px solid #ec407a", borderLeftColor: "transparent", borderRadius: "50%", transform: "rotate(30deg)" }} />
      <div style={{ ...abs, top: 75, right: -15, width: 35, height: 20, border: "6px solid #ec407a", borderLeftColor: "transparent", borderRadius: "50%", transform: "rotate(-30deg)" }} />
    </>
  );
}

function AngryChunk() {
  return (
    <>
      <div style={{ ...abs, top: -15, left: 50, width: 60, height: 25, background: "#3e2723", borderRadius: "50% 50% 0 0" }} />
      <div style={{ ...abs, top: 35, left: 30, width: 35, height: 6, background: "#000", transform: "rotate(15deg)" }} />
      <div style={{ ...abs, top: 35, right: 30, width: 35, height: 6, background: "#000", transform: "rotate(-15deg)" }} />
      <div style={{ ...abs, top: 20, left: 20, width: 160, height: 160, background: "#ff9800", borderRadius: "30% 70% 70% 30% / 50% 50% 50% 50%" }}>
        <div style={{ ...abs, top: 45, left: 35, width: 32, height: 32, background: "#fff", border: "3px solid #000", borderRadius: "50%" }}>
          <div style={{ ...abs, top: 8, left: 8, width: 12, height: 12, background: "#000", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 45, right: 35, width: 32, height: 32, background: "#fff", border: "3px solid #000", borderRadius: "50%" }}>
          <div style={{ ...abs, top: 8, left: 8, width: 12, height: 12, background: "#000", borderRadius: "50%" }} />
        </div>
        <div style={{ ...abs, top: 85, left: 65, width: 30, height: 14, background: "#5d4037", clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)" }} />
      </div>
      <div style={{ ...abs, top: 95, left: -15, width: 25, height: 35, border: "7px solid #ff9800", borderTopColor: "transparent", borderRadius: "40%", transform: "rotate(-45deg)" }} />
      <div style={{ ...abs, top: 95, right: -15, width: 25, height: 35, border: "7px solid #ff9800", borderTopColor: "transparent", borderRadius: "40%", transform: "rotate(45deg)" }} />
    </>
  );
}

const RENDERERS: Record<string, () => React.JSX.Element> = {
  "blue-blob": BlueBlob,
  "derpy-green": DerpyGreen,
  "cyclops-pink": CyclopsPink,
  "angry-chunk": AngryChunk,
};

interface PersonalityAvatarProps {
  avatarKey: string | null | undefined;
  size?: number;
  className?: string;
}

export function PersonalityAvatar({
  avatarKey,
  size = 24,
  className,
}: PersonalityAvatarProps) {
  const Renderer = avatarKey ? RENDERERS[avatarKey] : undefined;
  if (!Renderer) {
    return null;
  }
  const scale = size / ART;

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ART,
          height: ART,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div style={{ position: "relative", width: ART, height: ART }}>
          <Renderer />
        </div>
      </div>
    </div>
  );
}
