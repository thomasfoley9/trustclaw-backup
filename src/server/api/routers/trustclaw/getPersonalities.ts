import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { PRESET_PERSONALITIES, buildPersonaPrompt } from "./personalities";

export const getPersonalities = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { id: true, activePersonalityId: true },
  });

  if (!instance) {
    return { personalities: [], activePersonalityId: null };
  }

  // Seed presets on a fresh instance; otherwise keep existing preset rows in
  // sync with the canonical code definitions (so prompt/emoji/avatar tweaks
  // land everywhere). updateMany on a missing row is a no-op, so presets the
  // user deleted are NOT resurrected.
  const count = await db.personality.count({
    where: { instanceId: instance.id },
  });
  if (count === 0) {
    await db.personality.createMany({
      data: PRESET_PERSONALITIES.map((p) => ({
        instanceId: instance.id,
        name: p.name,
        emoji: p.emoji,
        avatarKey: p.avatarKey,
        prompt: buildPersonaPrompt(p.voice),
        isPreset: true,
      })),
      skipDuplicates: true,
    });
  } else {
    await Promise.all(
      PRESET_PERSONALITIES.map((p) =>
        db.personality.updateMany({
          where: { instanceId: instance.id, name: p.name, isPreset: true },
          data: {
            emoji: p.emoji,
            avatarKey: p.avatarKey,
            prompt: buildPersonaPrompt(p.voice),
          },
        }),
      ),
    );
  }

  // Only default-activate Professional on a freshly-seeded instance - if the
  // user explicitly cleared their personality, respect that.
  let activePersonalityId = instance.activePersonalityId;
  if (!activePersonalityId && count === 0) {
    const professional = await db.personality.findFirst({
      where: { instanceId: instance.id, name: "Professional" },
      select: { id: true },
    });
    if (professional) {
      await db.composioClawInstance.update({
        where: { id: instance.id },
        data: { activePersonalityId: professional.id },
      });
      activePersonalityId = professional.id;
    }
  }

  const personalities = await db.personality.findMany({
    where: { instanceId: instance.id },
    select: {
      id: true,
      name: true,
      emoji: true,
      avatarKey: true,
      prompt: true,
      isPreset: true,
    },
    orderBy: [{ isPreset: "desc" }, { name: "asc" }],
  });

  return { personalities, activePersonalityId };
});
