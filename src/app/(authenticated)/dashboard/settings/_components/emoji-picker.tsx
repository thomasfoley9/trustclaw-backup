"use client";

import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

// 40 curated emojis for agent personalities — faces, creatures, and vibes
// that read well at small sizes as an avatar.
export const PERSONALITY_EMOJIS = [
  "😊", "😎", "🤖", "🦉", "🔥", "💼", "🎯", "🚀",
  "🧠", "😈", "👑", "💡", "⚡", "🌶️", "🦾", "🥷",
  "🧙", "🦊", "🐺", "🐉", "🦅", "🦈", "🐍", "🦁",
  "💀", "👽", "🤠", "🧐", "🤓", "😼", "🫡", "🎩",
  "🪄", "⭐", "🌟", "💎", "🏆", "📈", "💰", "🎭",
] as const;

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1">
        {PERSONALITY_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            aria-label={`Use ${e}`}
            className={cn(
              "flex h-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-accent",
              value === e && "bg-accent ring-ring ring-2",
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <Input
        placeholder="Or type your own…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-center"
        maxLength={16}
      />
    </div>
  );
}
