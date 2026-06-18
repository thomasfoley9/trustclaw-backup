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

    const provider = input.modelId.slice(0, input.modelId.indexOf("/")).toLowerCase();
    const encryptedKey = input.providerApiKey
      ? encryptSecret(input.providerApiKey)
      : null;

    return db.customModel.upsert({
      where: {
        instanceId_modelId: { instanceId: instance.id, modelId: input.modelId },
      },
      create: {
        instanceId: instance.id,
        modelId: input.modelId,
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
