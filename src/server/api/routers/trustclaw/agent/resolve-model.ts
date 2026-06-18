import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";

// Bare Claude ids (no provider prefix) get the historical "anthropic/" prefix
// so the gateway resolves them; provider-prefixed ids pass through unchanged.
function gatewayString(modelId: string): string {
  return modelId.includes("/") ? modelId : `anthropic/${modelId}`;
}

// First-party providers we can call directly with a user's key. Anything else
// (no SDK installed) falls back to the gateway string id.
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

// Single source of truth for turning instance.anthropicModel into an AI-SDK
// model. Claude presets and key-less custom ids resolve to the gateway string
// (byte-for-byte the old behavior); a custom model with a BYO key resolves to
// a direct provider client. Decrypt failures fall back to the gateway string
// rather than killing the run.
export async function resolveAgentModel(
  instanceId: string,
  modelId: string,
): Promise<LanguageModel> {
  if (modelId.includes("/")) {
    try {
      const row = await db.customModel.findUnique({
        where: { instanceId_modelId: { instanceId, modelId } },
        select: { provider: true, providerApiKey: true },
      });
      if (row?.providerApiKey) {
        const apiKey = decryptSecret(row.providerApiKey);
        const bareModel = modelId.slice(modelId.indexOf("/") + 1);
        const direct = directModel(row.provider, bareModel, apiKey);
        if (direct) return direct;
      }
    } catch {
      // DB error or rotated/missing ENCRYPTION_KEY — never kill the run; fall
      // through to the gateway string.
    }
  }
  return gatewayString(modelId);
}
