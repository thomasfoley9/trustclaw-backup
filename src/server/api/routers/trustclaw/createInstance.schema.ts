import { z } from "zod";

export const ALLOWED_ANTHROPIC_MODELS = [
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
] as const;

export const allowedAnthropicModelSchema = z.enum(ALLOWED_ANTHROPIC_MODELS);

// Owner-funded house models selectable during onboarding (no user key needed).
// Keep in sync with HOUSE_MODELS in agent/resolve-model.ts and the UI list in
// onboarding.consts.ts.
export const HOUSE_MODEL_IDS = [
  "house/kimi-k2",
  "house/kimi-k2.7-highspeed",
  "house/kimi-k2.6",
  "house/kimi-k2.5",
  "house/deepseek",
  "house/deepseek-pro",
] as const;

export const houseModelSchema = z.enum(HOUSE_MODEL_IDS);

// What the onboarding model step may select: a Claude preset (BYO key) or a
// free house model.
export const onboardingModelSchema = z.union([
  allowedAnthropicModelSchema,
  houseModelSchema,
]);

// Looser id for user-added gateway-style models, e.g. "openai/gpt-4o".
export const customModelIdSchema = z
  .string()
  .trim()
  .max(100)
  .regex(
    /^[a-z0-9-]+\/[\w.:/-]+$/i,
    "Use provider/model, e.g. deepseek/deepseek-chat",
  );

// What may be saved as the selected model: a Claude preset or a custom id.
export const selectableModelSchema = z.union([
  allowedAnthropicModelSchema,
  customModelIdSchema,
]);

export const createInstanceInput = z.object({
  anthropicModel: onboardingModelSchema.default("claude-sonnet-5"),
});

export type CreateInstanceInput = z.infer<typeof createInstanceInput>;
