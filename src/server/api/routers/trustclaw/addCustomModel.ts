import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { encryptSecret } from "~/server/clients/crypto";
import { addCustomModelInput } from "./addCustomModel.schema";

// Model-listing endpoints per OpenAI-compatible provider. Mirrors the base
// URLs in agent/resolve-model.ts so validation hits the same host chat will.
const OPENAI_COMPATIBLE_MODELS_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  deepseek: "https://api.deepseek.com/v1/models",
  moonshot: "https://api.moonshot.ai/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
  together: "https://api.together.xyz/v1/models",
  xai: "https://api.x.ai/v1/models",
  fireworks: "https://api.fireworks.ai/inference/v1/models",
};

// Validate the key with a free, read-only call before storing - the same
// pattern as setAnthropicApiKey/setComposioApiKey. Without this a bad key is
// stored silently and only fails opaquely at chat time.
async function validateProviderKey(
  provider: string,
  apiKey: string,
): Promise<void> {
  let res: Response;
  try {
    if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(8000),
      });
    } else if (provider === "google") {
      res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        {
          headers: { "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(8000),
        },
      );
    } else if (provider === "openrouter") {
      // OpenRouter's /models listing is public - /key is the cheapest
      // authenticated endpoint.
      res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
    } else {
      const url = OPENAI_COMPATIBLE_MODELS_URLS[provider];
      // ALLOWED_PROVIDERS gates before this runs; an unknown provider here
      // means the two lists drifted - store nothing rather than skip checks.
      if (!url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Can't validate keys for "${provider}".`,
        });
      }
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Couldn't reach ${provider} to validate the key. Try again.`,
    });
  }
  // Google reports a malformed/invalid key as 400 (API_KEY_INVALID) rather
  // than 401 - treat it as a rejection, not a server error.
  const rejected =
    res.status === 401 ||
    res.status === 403 ||
    (provider === "google" && res.status === 400);
  if (rejected) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: `${provider} rejected this API key. Double-check and try again.`,
    });
  }
  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `${provider} returned ${res.status} while validating the key.`,
    });
  }
}

export const addCustomModel = protectedProcedure
  .input(addCustomModelInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    // Normalize the provider segment to lowercase so the stored id, the
    // gateway string, and the provider switch all agree on casing.
    const slash = input.modelId.indexOf("/");
    const provider = input.modelId.slice(0, slash).toLowerCase();
    const modelId = `${provider}/${input.modelId.slice(slash + 1)}`;

    // Label is optional in the UI - fall back to the model id itself.
    const label = input.label?.length ? input.label : modelId;

    // "house/" is reserved for built-in owner-funded models - a custom row with
    // that prefix would be silently shadowed by the house route in resolve-model.
    if (provider === "house") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          'The "house/" prefix is reserved for built-in models. Use a different provider id.',
      });
    }

    // Only providers resolve-model can actually call - otherwise the row is
    // stored but fails opaquely at chat time instead of here.
    const ALLOWED_PROVIDERS = new Set([
      "openai",
      "anthropic",
      "google",
      "deepseek",
      "moonshot",
      "openrouter",
      "groq",
      "together",
      "xai",
      "fireworks",
    ]);
    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Unsupported provider. Use one of: openai, anthropic, google, deepseek, moonshot, openrouter, groq, together, xai, fireworks.",
      });
    }

    // Catch obvious paste-into-wrong-field mistakes so a key isn't sent to a
    // provider it doesn't belong to. Lenient: only the clearest cross-provider
    // cases are rejected.
    if (input.providerApiKey) {
      const k = input.providerApiKey;
      const looksAnthropic = k.startsWith("sk-ant-");
      const looksOpenAi = k.startsWith("sk-") && !looksAnthropic;
      const mismatched =
        (provider === "openai" && looksAnthropic) ||
        (provider === "anthropic" && looksOpenAi) ||
        (provider === "google" && k.startsWith("sk-"));
      if (mismatched) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `That key doesn't look like a ${provider} key - double-check which provider you're configuring.`,
        });
      }
    }

    // Prove the key actually works against the provider before storing it.
    // Re-adding the same model without a key keeps the stored (already
    // validated) key, so only a newly supplied key needs the round-trip.
    if (input.providerApiKey) {
      await validateProviderKey(provider, input.providerApiKey);
    }

    const encryptedKey = input.providerApiKey
      ? encryptSecret(input.providerApiKey)
      : null;

    return db.customModel.upsert({
      where: {
        instanceId_modelId: { instanceId: instance.id, modelId },
      },
      create: {
        instanceId: instance.id,
        modelId,
        label,
        provider,
        providerApiKey: encryptedKey,
      },
      // Re-adding the same id updates the label and (if a new key was given)
      // the key; an omitted key leaves the stored one untouched.
      update: {
        label,
        provider,
        ...(encryptedKey ? { providerApiKey: encryptedKey } : {}),
      },
      select: { id: true, modelId: true, label: true, provider: true },
    });
  });
