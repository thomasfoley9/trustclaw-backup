import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { env } from "~/env";

export function createComposioClient(apiKey: string) {
  return new Composio({
    apiKey,
    provider: new VercelProvider(),
  });
}

/** True when the owner-funded shared Composio key is configured. */
export function isSharedComposioAvailable(): boolean {
  return !!env.COMPOSIO_API_KEY;
}

// TENANT ISOLATION (do not weaken): every Composio session is created for a
// per-user Composio user id, and connected accounts (Gmail/Calendar OAuth
// grants) belong to that id - user A's session can never see or use user B's
// connections, even on the shared platform key.
//
// The shared-key id is NAMESPACED ("trustclaw_<appUserId>") so it can never
// collide with the OWNER's personal Composio user in the same workspace (his
// own Gmail/Calendar connections live under a different, un-namespaced id).
// BYO keys keep the raw app user id - those connections live in the USER'S
// own Composio workspace, where the owner has no presence at all.
function sharedComposioUserId(appUserId: string): string {
  return `trustclaw_${appUserId}`;
}

type ComposioContext = {
  client: ReturnType<typeof createComposioClient>;
  composioUserId: string;
  instanceId: string;
};

function buildContext(
  storedApiKey: string | null,
  appUserId: string,
  instanceId: string,
): ComposioContext {
  // A user's own key always wins (their connections live in their workspace).
  if (storedApiKey) {
    let apiKey: string;
    try {
      apiKey = decryptSecret(storedApiKey);
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Your stored Composio API key couldn't be decrypted. Re-enter it in Settings.",
      });
    }
    return {
      client: createComposioClient(apiKey),
      composioUserId: appUserId,
      instanceId,
    };
  }

  // Owner-funded shared key: each user is an isolated tenant via the
  // namespaced Composio user id.
  if (env.COMPOSIO_API_KEY) {
    return {
      client: createComposioClient(env.COMPOSIO_API_KEY),
      composioUserId: sharedComposioUserId(appUserId),
      instanceId,
    };
  }

  // Self-hosted deployment without a shared key - BYO is still required.
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Set your Composio API key in Settings to use tools and integrations.",
  });
}

export async function getComposioForUser(
  userId: string,
): Promise<ComposioContext> {
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { id: true, userId: true, composioApiKey: true },
  });
  if (!instance) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No agent instance found for this user.",
    });
  }
  return buildContext(instance.composioApiKey, instance.userId, instance.id);
}

export async function getComposioForInstance(
  instanceId: string,
): Promise<ComposioContext> {
  const instance = await db.composioClawInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, userId: true, composioApiKey: true },
  });
  if (!instance) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agent instance not found.",
    });
  }
  return buildContext(instance.composioApiKey, instance.userId, instance.id);
}
