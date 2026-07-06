import { timingSafeEqual } from "node:crypto";
import { AgentDispatchClient } from "livekit-server-sdk";
import { env } from "~/env";

// Cron-triggered warm-keeper for the LiveKit voice worker. LiveKit Cloud
// scales the agent to zero when idle, so the first call after a quiet period
// pays a multi-second cold boot before it can greet. A no-op dispatch every
// few minutes counts as activity and keeps the instance hot; the worker
// recognizes the keepalive flag and exits before any model setup, so pings
// cost nothing on the OpenAI side.
export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(request: Request) {
  if (env.NODE_ENV !== "development") {
    if (typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length === 0) {
      return new Response("Server misconfigured: CRON_SECRET missing", {
        status: 503,
      });
    }
    const auth = request.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const serverUrl = env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !serverUrl) {
    return Response.json({ skipped: "voice not configured" });
  }

  const httpUrl = serverUrl.replace(/^ws/, "http");
  const dispatcher = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
  try {
    // Unique room per ping - empty rooms are garbage-collected by LiveKit.
    const roomName = `claw_keepalive_${Date.now()}`;
    await Promise.race([
      dispatcher.createDispatch(roomName, "claw-voice", {
        metadata: JSON.stringify({ keepalive: true }),
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dispatch timeout")), 8000),
      ),
    ]);
    return Response.json({ status: "warm" });
  } catch (error) {
    console.error("[voice/keepalive] dispatch failed:", error);
    // Non-fatal: the next ping retries; worst case the next call cold-boots.
    return Response.json({ status: "ping_failed" }, { status: 200 });
  }
}
