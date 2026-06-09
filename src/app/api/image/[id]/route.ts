import { readFile } from "fs/promises";
import path from "path";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { GENERATED_IMAGES_DIR } from "~/server/api/routers/trustclaw/agent/tools/generate-image";

const UUID_RE = /^[0-9a-f-]{36}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate the id shape to prevent path traversal.
  if (!UUID_RE.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  // Images are user content: require a session, and only serve from the
  // requesting user's own per-instance directory.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const instance = await db.composioClawInstance.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!instance) {
    return new Response("Not found", { status: 404 });
  }

  const candidates = [
    path.join(GENERATED_IMAGES_DIR, instance.id, `${id}.png`),
    // Legacy flat layout from before per-instance scoping.
    path.join(GENERATED_IMAGES_DIR, `${id}.png`),
  ];

  for (const filePath of candidates) {
    try {
      const buffer = await readFile(filePath);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    } catch {
      // try next candidate
    }
  }

  return new Response("Not found", { status: 404 });
}
