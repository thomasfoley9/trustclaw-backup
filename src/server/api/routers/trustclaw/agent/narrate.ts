import { generateText } from "ai";
import { resolveAgentModel } from "./resolve-model";

// Agent A — the conversational "head" of the two-agent system. It is NOT a
// tool-using agent: it's a single stateless generateText() pass that turns
// Agent B's raw execution output into a short, natural chat reply. It never
// opens a Composio session, never consumes B's step budget, and never touches
// memory/compaction. On any failure it returns B's text so the chat is never
// empty.
const NARRATOR_SYSTEM = `You are "Agent A" — the conversational front of a two-agent assistant. Another agent ("Agent B") just did the actual work: ran tools, fetched data, took actions. Your job is to turn B's raw output into a short, natural reply to the user, in the assistant's own voice.

Rules:
- 1 to 4 sentences. Conversational, like a person — not a status report.
- Speak outcomes and consequences, never tool mechanics or raw data dumps.
- Stay in the assistant's persona/tone. If it's blunt, crude, or unhinged, stay that way.
- Only state what B actually found or did. Never invent actions, numbers, or facts B didn't produce.
- Light markdown is fine (this is chat, not voice). End with a short offer only if it genuinely fits.
Output ONLY the reply text — nothing else.`;

interface NarrateArgs {
  instanceId: string;
  modelId: string;
  executorText: string;
  toolStepsDigest: string;
  personaName?: string | null;
}

// Compact, results-stripped digest of B's tool steps, so A knows what B did
// without re-reading raw tool outputs.
export function buildToolStepsDigest(toolNames: string[]): string {
  if (toolNames.length === 0) return "";
  const counts = new Map<string, number>();
  for (const name of toolNames) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, n]) => `- ${name}${n > 1 ? ` (x${n})` : ""}`)
    .join("\n");
}

export async function narrateWithAgentA({
  instanceId,
  modelId,
  executorText,
  toolStepsDigest,
  personaName,
}: NarrateArgs): Promise<string> {
  const clean = executorText.trim();
  const fallback = clean.slice(0, 4000);
  // Nothing to narrate.
  if (!clean && !toolStepsDigest.trim()) return clean;

  try {
    const model = await resolveAgentModel(instanceId, modelId);
    const personaLine = personaName
      ? `\n\nThe assistant's active persona is "${personaName}" — keep that exact voice.`
      : "";
    const { text } = await generateText({
      model,
      system: NARRATOR_SYSTEM + personaLine,
      prompt:
        `Agent B's output:\n${clean.slice(0, 8000)}` +
        (toolStepsDigest.trim()
          ? `\n\nWhat B did (tools):\n${toolStepsDigest.slice(0, 1500)}`
          : ""),
      maxOutputTokens: 500,
    });
    const out = text.trim();
    return out.length > 0 ? out : fallback;
  } catch {
    // resolve/generate failure (e.g. no key) — never block the chat on A.
    return fallback;
  }
}
