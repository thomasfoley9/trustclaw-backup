import { readFile } from "fs/promises";
import path from "path";
import { GENERATED_IMAGES_DIR } from "~/server/api/routers/trustclaw/agent/tools/generate-image";

const UUID_RE = /^[0-9a-f-]{36}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate the id shape to prevent path traversal.
  if (!UUID_RE.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(GENERATED_IMAGES_DIR, `${id}.png`));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
