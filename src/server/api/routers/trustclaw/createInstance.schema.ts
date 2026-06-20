import { z } from "zod";

export const ALLOWED_ANTHROPIC_MODELS = [
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export const allowedAnthropicModelSchema = z.enum(ALLOWED_ANTHROPIC_MODELS);

// Looser id for user-added gateway-style models, e.g. "openai/gpt-4o".
export const customModelIdSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[a-z0-9-]+\/[\w.:-]+$/i, "Use provider/model, e.g. openai/gpt-4o");

// What may be saved as the selected model: a Claude preset or a custom id.
export const selectableModelSchema = z.union([
  allowedAnthropicModelSchema,
  customModelIdSchema,
]);

export const createInstanceInput = z.object({
  anthropicModel: allowedAnthropicModelSchema.default(
    "claude-sonnet-4-5-20250929",
  ),
});

export type CreateInstanceInput = z.infer<typeof createInstanceInput>;
