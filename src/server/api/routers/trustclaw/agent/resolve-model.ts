import type { LanguageModel } from "ai";
import { TRPCError } from "@trpc/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";

// First-party providers we can call directly with a user's key.
function directModel(
  provider: string,
  bareModel: string,
  apiKey: string,
): LanguageModel | null {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(bareModel);
    case "anthropic":
      return createAnthropic({ apiKey })(bareModel);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(bareModel);
    default:
      return null;
  }
}

// The instance's own Anthropic key (decrypted), or null. Never throws.
async function instanceAnthropicKey(
  instanceId: string,
): Promise<string | null> {
  try {
    const inst = await db.composioClawInstance.findUnique({
      where: { id: instanceId },
      select: { anthropicApiKey: true },
    });
    return inst?.anthropicApiKey ? decryptSecret(inst.anthropicApiKey) : null;
  } catch {
    return null;
  }
}

function missingKey(message: string): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}

// Single source of truth for turning a model id into an AI-SDK model — always
// billed to the USER, never the owner's gateway. Bare Claude presets use the
// instance's own Anthropic key; provider-prefixed custom models use their own
// BYO key (Anthropic customs may fall back to the instance Anthropic key). If
// no user key is available we fail closed so nobody rides the owner's spend.
export async function resolveAgentModel(
  instanceId: string,
  modelId: string,
): Promise<LanguageModel> {
  if (modelId.includes("/")) {
    const slash = modelId.indexOf("/");
    const provider = modelId.slice(0, slash).toLowerCase();
    const bareModel = modelId.slice(slash + 1);

    const row = await db.customModel.findUnique({
      where: { instanceId_modelId: { instanceId, modelId } },
      select: { providerApiKey: true },
    });

    let apiKey: string | null = null;
    try {
      apiKey = row?.providerApiKey ? decryptSecret(row.providerApiKey) : null;
    } catch {
      apiKey = null;
    }
    // Anthropic custom ids can reuse the instance's Anthropic key.
    if (!apiKey && provider === "anthropic") {
      apiKey = await instanceAnthropicKey(instanceId);
    }
    if (!apiKey) {
      missingKey(
        `Add your ${provider} API key for "${modelId}" in Settings to use this model.`,
      );
    }
    const direct = directModel(provider, bareModel, apiKey);
    if (direct) return direct;
    missingKey(
      `"${provider}" isn't a supported provider — use OpenAI, Anthropic, or Google with your own key.`,
    );
  }

  // Bare Claude preset → instance's own Anthropic key. No gateway fallback.
  const apiKey = await instanceAnthropicKey(instanceId);
  if (!apiKey) {
    missingKey("Add your Anthropic API key in Settings to start chatting.");
  }
  return createAnthropic({ apiKey })(modelId);
}
