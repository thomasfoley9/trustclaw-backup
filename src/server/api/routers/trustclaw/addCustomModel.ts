import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { encryptSecret } from "~/server/clients/crypto";
import { addCustomModelInput } from "./addCustomModel.schema";

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

    // "house/" is reserved for built-in owner-funded models — a custom row with
    // that prefix would be silently shadowed by the house route in resolve-model.
    if (provider === "house") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          'The "house/" prefix is reserved for built-in models. Use a different provider id.',
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
          message: `That key doesn't look like a ${provider} key — double-check which provider you're configuring.`,
        });
      }
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
        label: input.label,
        provider,
        providerApiKey: encryptedKey,
      },
      // Re-adding the same id updates the label and (if a new key was given)
      // the key; an omitted key leaves the stored one untouched.
      update: {
        label: input.label,
        provider,
        ...(encryptedKey ? { providerApiKey: encryptedKey } : {}),
      },
      select: { id: true, modelId: true, label: true, provider: true },
    });
  });
