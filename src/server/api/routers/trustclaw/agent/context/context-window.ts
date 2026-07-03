// Claude 4.x presets are all 200K. Custom (BYO) models are ASSUMED to be 200K
// too - if a smaller-window model is added, compaction may trigger late. Map
// specific custom ids here if that becomes a problem.
const CONTEXT_WINDOW = 200_000;

// Models whose window differs from the 200K default. House models are
// OpenAI-compatible providers with their own limits - assuming 200K for a
// smaller-window model makes compaction fire too late and the provider 400s on
// long chats. Best-effort published values; lower if a provider rejects long
// contexts.
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // DeepSeek V4 family advertises 1M; stay conservative so compaction fires
  // well before the provider's real ceiling.
  "house/deepseek": 256_000,
  "house/deepseek-pro": 256_000,
  // The Kimi K2.x family is 262,144 - stay at 256K.
  "house/kimi-k2": 256_000,
  "house/kimi-k2.7-highspeed": 256_000,
  "house/kimi-k2.6": 256_000,
  "house/kimi-k2.5": 256_000,
};

export function getContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? CONTEXT_WINDOW;
}
