import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";

function mask(stored: string): string | null {
  try {
    const key = decryptSecret(stored);
    if (key.length <= 8) return "•".repeat(key.length);
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  } catch {
    return null;
  }
}

export const getCustomModels = protectedProcedure.query(async ({ ctx }) => {
  const instance = await db.composioClawInstance.findUnique({
    where: { userId: ctx.session.user.id },
    select: { id: true },
  });
  if (!instance) return { models: [] };

  const rows = await db.customModel.findMany({
    where: { instanceId: instance.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      modelId: true,
      label: true,
      provider: true,
      providerApiKey: true,
    },
  });

  return {
    models: rows.map((r) => ({
      id: r.id,
      modelId: r.modelId,
      label: r.label,
      provider: r.provider,
      hasKey: !!r.providerApiKey,
      maskedKey: r.providerApiKey ? mask(r.providerApiKey) : null,
    })),
  };
});
