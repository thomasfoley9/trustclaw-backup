export const STEP_ORDER = [
  "name",
  "writing-style",
  "personality",
  "emoji",
  "lore",
  "model",
  "integrations",
  "telegram",
] as const;

export type Step = (typeof STEP_ORDER)[number];

export const WRITING_STYLES = [
  { key: "lowercase", label: "no caps, no stress" },
  { key: "professional", label: "crisp & polished" },
  { key: "friendly", label: "like texting a friend" },
  { key: "playful", label: "delightfully unhinged" },
] as const;

export type WritingStyleKey = (typeof WRITING_STYLES)[number]["key"];

export const PERSONALITIES = [
  { key: "kind", label: "your personal cheerleader" },
  { key: "sassy", label: "says what you're thinking" },
  { key: "energetic", label: "runs on espresso" },
  { key: "curious", label: "down every rabbit hole" },
] as const;

export type PersonalityKey = (typeof PERSONALITIES)[number]["key"];

export const CURATED_EMOJIS = [
  "\u{1F319}", "\u26A1", "\u{1F525}", "\u{1F48E}", "\u{1F30A}", "\u{1F3AF}",
  "\u{1F98A}", "\u{1F419}", "\u{1F98B}", "\u{1F433}", "\u{1F989}", "\u{1F438}",
  "\u{1F680}", "\u{1F3AE}", "\u{1F3B8}", "\u{1F3A8}", "\u{1F52E}", "\u{1F9E0}",
  "\u2728", "\u{1F4AB}", "\u{1F338}", "\u{1F340}", "\u2600\uFE0F", "\u{1F308}",
] as const;

export const MODELS = [
  {
    value: "claude-fable-5" as const,
    label: "Claude Fable 5",
    description: "Most intelligent",
    cost: "$$$$",
  },
  {
    value: "claude-opus-4-8" as const,
    label: "Claude Opus 4.8",
    description: "Most capable Opus",
    cost: "$$$",
  },
  {
    value: "claude-opus-4-7" as const,
    label: "Claude Opus 4.7",
    description: "Highly capable",
    cost: "$$$",
  },
  {
    value: "claude-opus-4-6" as const,
    label: "Claude Opus 4.6",
    description: "Very capable",
    cost: "$$$",
  },
  {
    value: "claude-sonnet-5" as const,
    label: "Claude Sonnet 5",
    description: "Near-Opus, Sonnet price",
    cost: "$$",
  },
  {
    value: "claude-sonnet-4-6" as const,
    label: "Claude Sonnet 4.6",
    description: "Fast & balanced",
    cost: "$$",
  },
  {
    value: "claude-sonnet-4-5-20250929" as const,
    label: "Claude Sonnet 4.5",
    description: "Balanced",
    cost: "$$",
  },
  {
    value: "claude-haiku-4-5-20251001" as const,
    label: "Claude Haiku 4.5",
    description: "Fast & affordable",
    cost: "$",
  },
] as const;

// House models: owner-funded, free to every user, no key needed - they run an
// uncensored persona. Ids are stable routing keys (stored on instances); the
// concrete provider model behind each lives in agent/resolve-model.ts.
export const HOUSE_MODELS = [
  {
    value: "house/kimi-k3" as const,
    label: "Kimi K3",
    description: "Free · uncensored · new flagship, 1M context",
    cost: "free",
  },
  {
    value: "house/kimi-k2" as const,
    label: "Kimi K2.7 Code",
    description: "Free · uncensored · on the house",
    cost: "free",
  },
  {
    value: "house/kimi-k2.7-highspeed" as const,
    label: "Kimi K2.7 Highspeed",
    description: "Free · uncensored · fastest output",
    cost: "free",
  },
  {
    value: "house/kimi-k2.6" as const,
    label: "Kimi K2.6",
    description: "Free · uncensored · vision + thinking",
    cost: "free",
  },
  {
    value: "house/kimi-k2.5" as const,
    label: "Kimi K2.5",
    description: "Free · uncensored · vision",
    cost: "free",
  },
  {
    value: "house/deepseek" as const,
    label: "DeepSeek V4 Flash",
    description: "Free · uncensored · on the house",
    cost: "free",
  },
  {
    value: "house/deepseek-pro" as const,
    label: "DeepSeek V4 Pro",
    description: "Free · uncensored · on the house",
    cost: "free",
  },
] as const;

export const INTEGRATION_DESCRIPTIONS: Record<string, string> = {
  gmail: "Read and send emails",
  github: "Manage repos and issues",
  slack: "Send and read messages",
};

export const WRITING_STYLE_ITEM_MAP: Record<WritingStyleKey, string> = {
  lowercase: "phone",
  professional: "briefcase",
  friendly: "heart",
  playful: "partyhat",
};

export const PERSONALITY_OUTFIT_MAP: Record<PersonalityKey, string> = {
  kind: "pompoms",
  sassy: "sunglasses",
  energetic: "coffee",
  curious: "nerdglasses",
};
