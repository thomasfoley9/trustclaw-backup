import type { LanguageModel } from "ai";
import { TRPCError } from "@trpc/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { env } from "~/env";

// OpenAI-compatible providers (identical wire format, different base URL) - lets
// users bring DeepSeek, Kimi/Moonshot, OpenRouter, Groq, etc. with their own key.
const OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  moonshot: "https://api.moonshot.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
  xai: "https://api.x.ai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// "House" models ride OWNER-funded keys - free to every user, billed to the
// owner. Each prefers its native provider key (if set), else the shared
// OpenRouter key.
// The "house/..." ids are stable routing keys stored on instances - upgrade
// the concrete provider model HERE and every user upgrades with it.
// Ids verified against the providers' live catalogs 2026-07-16.
const HOUSE_MODELS: Record<
  string,
  { nativeBaseURL: string; nativeModel: string; openrouterModel: string }
> = {
  "house/kimi-k3": {
    nativeBaseURL: "https://api.moonshot.ai/v1",
    // Moonshot's new flagship (launched 2026-07-16): 2.8T MoE, 1M ctx. Only
    // one API model id shipped at launch - no highspeed/turbo tier yet.
    nativeModel: "kimi-k3",
    openrouterModel: "moonshotai/kimi-k3",
  },
  "house/deepseek": {
    nativeBaseURL: "https://api.deepseek.com/v1",
    nativeModel: "deepseek-v4-flash",
    openrouterModel: "deepseek/deepseek-v4-flash",
  },
  "house/deepseek-pro": {
    nativeBaseURL: "https://api.deepseek.com/v1",
    nativeModel: "deepseek-v4-pro",
    openrouterModel: "deepseek/deepseek-v4-pro",
  },
  "house/kimi-k2": {
    nativeBaseURL: "https://api.moonshot.ai/v1",
    // K2.7 Code - Moonshot's current flagship (256K ctx, ~30% fewer thinking
    // tokens than the k2.6 this used to pin).
    nativeModel: "kimi-k2.7-code",
    openrouterModel: "moonshotai/kimi-k2.7-code",
  },
  "house/kimi-k2.7-highspeed": {
    nativeBaseURL: "https://api.moonshot.ai/v1",
    // Same weights as kimi-k2.7-code served ~180-260 tok/s at 2x the price.
    // OpenRouter doesn't carry the highspeed tier - the fallback serves the
    // standard variant (same model, slower).
    nativeModel: "kimi-k2.7-code-highspeed",
    openrouterModel: "moonshotai/kimi-k2.7-code",
  },
  "house/kimi-k2.6": {
    nativeBaseURL: "https://api.moonshot.ai/v1",
    nativeModel: "kimi-k2.6",
    openrouterModel: "moonshotai/kimi-k2.6",
  },
  "house/kimi-k2.5": {
    nativeBaseURL: "https://api.moonshot.ai/v1",
    nativeModel: "kimi-k2.5",
    openrouterModel: "moonshotai/kimi-k2.5",
  },
};

export function isHouseModel(modelId: string): boolean {
  return modelId in HOUSE_MODELS;
}

function houseNativeKey(modelId: string): string | undefined {
  if (modelId.startsWith("house/deepseek")) return env.DEEPSEEK_API_KEY;
  if (modelId.startsWith("house/kimi")) return env.MOONSHOT_API_KEY;
  return undefined;
}

// First-party + OpenAI-compatible providers we can call directly with a user's key.
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
    default: {
      // OpenAI-compatible providers only implement Chat Completions, not the
      // OpenAI Responses API - use .chat() so we hit /v1/chat/completions.
      const baseURL = OPENAI_COMPATIBLE_BASE_URLS[provider];
      return baseURL ? createOpenAI({ apiKey, baseURL }).chat(bareModel) : null;
    }
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

// Single source of truth for turning a model id into an AI-SDK model. House
// models (the default) are the one owner-funded path - free to every user.
// Everything else bills to the USER: bare Claude presets use the instance's
// own Anthropic key; provider-prefixed custom models use their own BYO key
// (Anthropic customs may fall back to the instance Anthropic key). If no user
// key is available we fail closed so nobody rides the owner's spend beyond
// the house models.
export async function resolveAgentModel(
  instanceId: string,
  modelId: string,
): Promise<LanguageModel> {
  // House models: owner-funded, free to all users. Checked first so "house/..."
  // isn't treated as a BYO custom model below. Prefer the native provider key;
  // fall back to the shared OpenRouter key.
  const houseRoute = HOUSE_MODELS[modelId];
  if (houseRoute) {
    const nativeKey = houseNativeKey(modelId);
    if (nativeKey) {
      // .chat() = Chat Completions API. The default callable uses the OpenAI
      // Responses API (/v1/responses), which DeepSeek/Moonshot don't implement.
      return createOpenAI({
        apiKey: nativeKey,
        baseURL: houseRoute.nativeBaseURL,
      }).chat(houseRoute.nativeModel);
    }
    if (env.OPENROUTER_API_KEY) {
      return createOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
      }).chat(houseRoute.openrouterModel);
    }
    missingKey(
      "This house model isn't set up yet - the owner needs to add its API key.",
    );
  }

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
    } catch (err) {
      // A stored key that won't decrypt (corrupt row / wrong ENCRYPTION_KEY)
      // shouldn't be silently indistinguishable from "no key set".
      console.error(
        `[resolve-model] failed to decrypt provider key for ${modelId}`,
        err instanceof Error ? err.message : err,
      );
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
      `"${provider}" isn't a supported provider. Use one of: openai, anthropic, google, deepseek, moonshot, openrouter, groq, together, xai, fireworks.`,
    );
  }

  // Bare Claude preset → instance's own Anthropic key. No gateway fallback.
  const apiKey = await instanceAnthropicKey(instanceId);
  if (!apiKey) {
    missingKey("Add your Anthropic API key in Settings to start chatting.");
  }
  return createAnthropic({ apiKey })(modelId);
}
