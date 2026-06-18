import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/clients/db";

export function createComposioClient(apiKey: string) {
  return new Composio({
    apiKey,
    provider: new VercelProvider(),
  });
}

type ComposioContext = {
  client: ReturnType<typeof createComposioClient>;
  composioUserId: string;
  instanceId: string;
};

function buildContext(
  apiKey: string | null,
  composioUserId: string,
  instanceId: string,
): ComposioContext {
  if (!apiKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Set your Composio API key in Settings to use tools and integrations.",
    });
  }
  return {
    client: createComposioClient(apiKey),
    composioUserId,
    instanceId,
  };
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
