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

// "House" models ride OWNER-funded keys — free to every user, billed to the
// owner. Each prefers its native provider key (if set), else the shared
// OpenRouter key.
const HOUSE_MODELS: Record<
  string,
  { nativeBaseURL: string; nativeModel: string; openrouterModel: string }
> = {
  "house/deepseek": {
    nativeBaseURL: "https://api.deepseek.com/v1",
    nativeModel: "deepseek-v4-flash",
    openrouterModel: "deepseek/deepseek-v4-flash",
  },
  "house/kimi-k2": {
    nativeBaseURL: "https://api.moonshot.ai/v1",
    nativeModel: "kimi-k2.6",
    openrouterModel: "moonshotai/kimi-k2",
  },
};

export function isHouseModel(modelId: string): boolean {
  return modelId in HOUSE_MODELS;
}

function houseNativeKey(modelId: string): string | undefined {
  if (modelId === "house/deepseek") return env.DEEPSEEK_API_KEY;
  if (modelId === "house/kimi-k2") return env.MOONSHOT_API_KEY;
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
      // OpenAI Responses API — use .chat() so we hit /v1/chat/completions.
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

// Single source of truth for turning a model id into an AI-SDK model — always
// billed to the USER, never the owner's gateway. Bare Claude presets use the
// instance's own Anthropic key; provider-prefixed custom models use their own
// BYO key (Anthropic customs may fall back to the instance Anthropic key). If
// no user key is available we fail closed so nobody rides the owner's spend.
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
      "This house model isn't set up yet — the owner needs to add its API key.",
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
