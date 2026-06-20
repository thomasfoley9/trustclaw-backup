import { generateText } from "ai";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { resolveAgentModel } from "~/server/api/routers/trustclaw/agent/resolve-model";

export const maxDuration = 30;

// Turns the assistant's written reply into a short SPOKEN brief — the "Agent A"
// curation layer. Voice reads this, never the full on-screen digest.
const BRIEF_SYSTEM = `You convert an assistant's written reply into a SPOKEN brief for a voice assistant — like an executive assistant giving a quick verbal update on the phone.

Rules:
- 1 to 3 short sentences. Ruthlessly concise — this is for the ear, not the eye.
- Lead with what matters most. Collapse long lists into counts ("twenty emails, three need you").
- Plain speech ONLY: no markdown, no bullet points, no emoji, no URLs, no IDs or code. Say numbers naturally.
- Don't narrate tool mechanics or restate raw data — speak consequences.
- Keep the tone and voice of the original reply (if it's blunt or crude, stay blunt or crude).
- When it fits, end with a brief offer ("want me to take the build first?").
Output ONLY the spoken brief text — nothing else.`;

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

  // If anything fails (no key, model error), fall back to a trimmed version of
  // the original so voice still says *something* rather than going silent.
  const fallback = text.slice(0, 600);
  try {
    const model = await resolveAgentModel(instance.id, instance.anthropicModel);
    const { text: brief } = await generateText({
      model,
      system: BRIEF_SYSTEM,
      prompt: text.slice(0, 8000),
      maxOutputTokens: 220,
    });
    const out = brief.trim();
    return Response.json({ brief: out.length > 0 ? out : fallback });
  } catch {
    return Response.json({ brief: fallback });
  }
}
