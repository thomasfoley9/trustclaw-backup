// Claude 4.x presets are all 200K. Custom (BYO) models are ASSUMED to be 200K
// too — if a smaller-window model is added, compaction may trigger late. Map
// specific custom ids here if that becomes a problem.
const CONTEXT_WINDOW = 200_000;

export function getContextWindow(_modelId: string): number {
  return CONTEXT_WINDOW;
}
