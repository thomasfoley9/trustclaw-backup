import { getComposioForInstance } from "~/server/clients/composio";

// Direct server-side Composio tool execution for the EA's deterministic code
// paths (Slack posts, calendar scans, Gmail delta reads). The agent's own
// tool access goes through the tool-router session in setup.ts; this is the
// code-not-model path, so it executes exact slugs with exact arguments.

export interface ComposioExecResult {
  successful: boolean;
  data: Record<string, unknown>;
  error: string | null;
}

export async function executeComposio(
  instanceId: string,
  slug: string,
  args: Record<string, unknown>,
): Promise<ComposioExecResult> {
  const { client, composioUserId } = await getComposioForInstance(instanceId);
  const response = await client.tools.execute(slug, {
    userId: composioUserId,
    arguments: args,
  });
  return {
    successful: response.successful === true,
    data: response.data ?? {},
    error: typeof response.error === "string" ? response.error : null,
  };
}

// Defensive readers for loosely-shaped Composio payloads.
export function pick(
  obj: Record<string, unknown> | undefined,
  key: string,
): unknown {
  return obj ? obj[key] : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
