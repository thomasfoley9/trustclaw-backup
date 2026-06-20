"use client";

import {
  AVATAR_SVGS,
  DEFAULT_AVATAR_KEY,
  PERSONALITY_AVATARS,
  type PersonalityAvatarKey,
} from "./personality-avatars-data";

export { PERSONALITY_AVATARS };
export type { PersonalityAvatarKey };

interface PersonalityAvatarProps {
  avatarKey: string | null | undefined;
  size?: number;
  className?: string;
  // When true (default), an unknown/missing key still renders the default
  // avatar so every personality shows something. Set false for pickers.
  fallback?: boolean;
}

export function PersonalityAvatar({
  avatarKey,
  size = 24,
  className,
  fallback = true,
}: PersonalityAvatarProps) {
  const direct = avatarKey ? AVATAR_SVGS[avatarKey] : undefined;
  const svg = direct ?? (fallback ? AVATAR_SVGS[DEFAULT_AVATAR_KEY] : undefined);
  if (!svg) return null;

  // Render 10% larger than requested, platform-wide.
  const px = size * 1.1;

  // SVGs are static, build-time constants authored by us — safe to inline.
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: px,
        height: px,
        flexShrink: 0,
        lineHeight: 0,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
