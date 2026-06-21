import { generateText } from "ai";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { resolveAgentModel } from "~/server/api/routers/trustclaw/agent/resolve-model";

export const maxDuration = 30;

// Turns the assistant's written reply into a short SPOKEN brief — the "Agent A"
// curation layer. Voice reads this, never the full on-screen digest.
const BRIEF_SYSTEM = `You are a voice assistant giving a quick verbal update on the phone. Convert the assistant's written reply into the SHORTEST useful spoken answer.

Rules:
- ONE sentence. Two only if genuinely necessary. Aim for under 25 spoken words — this is for the ear, and the full answer is already on screen.
- Lead with the single most important thing. Collapse lists into counts ("twenty emails, three need you"). Drop detail the listener can read on screen.
- Plain speech ONLY: no markdown, no bullets, no emoji, no URLs, no IDs or code. Say numbers naturally.
- Speak the outcome, not tool mechanics or raw data.
- Keep the tone of the original (if it's blunt or crude, stay blunt or crude).
- If there's more to say, end by offering it ("want the details?") rather than dumping it.
Output ONLY the spoken text — nothing else.`;

// Last-resort fallback: never speak the whole essay. Strip light markdown and
// return roughly the first sentence (hard-capped) so voice stays short even when
// the curation model is unavailable.
function shortSpoken(text: string): string {
  const t = text
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = /^.*?[.!?](\s|$)/.exec(t)?.[0]?.trim() ?? t;
  return sentence.length > 180 ? `${sentence.slice(0, 180).trim()}…` : sentence;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return new Response("Empty text", { status: 400 });
  }

  const instance = await db.composioClawInstance.findUnique({
    where: { userId: session.user.id },
    select: { id: true, anthropicModel: true },
  });
  if (!instance) {
    return new Response("No instance", { status: 404 });
  }

  // If anything fails (no key, model error), fall back to a SHORT spoken version
  // — never the whole reply — so voice stays brief even when curation is down.
  const fallback = shortSpoken(text);
  try {
    const model = await resolveAgentModel(instance.id, instance.anthropicModel);
    const { text: brief } = await generateText({
      model,
      system: BRIEF_SYSTEM,
      prompt: text.slice(0, 8000),
      maxOutputTokens: 120,
    });
    const out = brief.trim();
    return Response.json({ brief: out.length > 0 ? out : fallback });
  } catch {
    return Response.json({ brief: fallback });
  }
}
