import type { LanguageModel } from "ai";
import { TRPCError } from "@trpc/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { env } from "~/env";

// OpenAI-compatible providers (identical wire format, different base URL) — lets
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

// "House" models ride the OWNER's shared OpenRouter key — free to every user,
// billed to the owner's account. Map: house id -> OpenRouter model slug.
const HOUSE_MODELS: Record<string, string> = {
  "house/kimi-k2": "moonshotai/kimi-k2",
  "house/deepseek": "deepseek/deepseek-chat",
};

export function isHouseModel(modelId: string): boolean {
  return modelId in HOUSE_MODELS;
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
      const baseURL = OPENAI_COMPATIBLE_BASE_URLS[provider];
      return baseURL ? createOpenAI({ apiKey, baseURL })(bareModel) : null;
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

// Single source of truth for turning a model id into an AI-SDK model — always
// billed to the USER, never the owner's gateway. Bare Claude presets use the
// instance's own Anthropic key; provider-prefixed custom models use their own
// BYO key (Anthropic customs may fall back to the instance Anthropic key). If
// no user key is available we fail closed so nobody rides the owner's spend.
export async function resolveAgentModel(
  instanceId: string,
  modelId: string,
): Promise<LanguageModel> {
  // House models: owner-funded shared key, free to all users. Checked first so
  // "house/..." isn't treated as a BYO custom model below.
  const houseSlug = HOUSE_MODELS[modelId];
  if (houseSlug) {
    if (!env.OPENROUTER_API_KEY) {
      missingKey(
        "The house models aren't set up yet — ask the owner to add an OpenRouter key.",
      );
    }
    return createOpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
    })(houseSlug);
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
