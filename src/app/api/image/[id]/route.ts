import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";

const UUID_RE = /^[0-9a-f-]{36}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  // Images are user content: require a session, and only serve the requesting
  // user's own images.
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

  const image = await db.generatedImage.findFirst({
    where: { id, instanceId: instance.id },
    select: { data: true, mimeType: true },
  });
  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
