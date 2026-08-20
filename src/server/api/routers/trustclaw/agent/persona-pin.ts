// Persona pinning for live voice calls.
//
// Agent A (the spoken agent) has its persona baked into its instructions at
// dispatch and cannot change it for the life of the call. Agent B (the
// delegate) re-reads the instance's current persona every turn and Agent A
// SPEAKS Agent B's text - so without a pin, switching personality mid-call
// makes the old voice deliver the new persona's wording.
//
// The call's conversation records the dispatched persona in `voicePersonaId`:
//   null    -> not a pinned run (normal text chat, or a call that started
//              before pinning shipped): follow the instance's current persona.
//   "none"  -> the call started on the default voice: pin to no persona.
//   <cuid>  -> pin to that personality.
//
// Kept dependency-free so it is unit-testable without pulling in Prisma.

export const NO_PERSONA = "none";

export function isPersonaPinned(
  pinnedPersonalityId: string | null | undefined,
): boolean {
  return pinnedPersonalityId !== null && pinnedPersonalityId !== undefined;
}

/**
 * The prompt a pinned run should speak with, or null to resolve normally.
 *
 * Pinning the id alone is not enough: the personality row can be edited or
 * deleted while the call is running, which would desync the delegate from the
 * spoken agent (a delete previously dropped it to the default character
 * mid-call). The call therefore replays the prompt captured at dispatch.
 */
export function resolvePinnedPrompt(
  pinnedPersonalityId: string | null | undefined,
  pinnedPersonaPrompt: string | null | undefined,
): string | null {
  if (!isPersonaPinned(pinnedPersonalityId)) return null;
  return pinnedPersonaPrompt ?? null;
}

/**
 * The personality id this run should actually use, or null for "no persona"
 * (fall back to the instance's soul prompt).
 */
export function resolvePersonalityId(
  pinnedPersonalityId: string | null | undefined,
  instanceActivePersonalityId: string | null,
): string | null {
  if (!isPersonaPinned(pinnedPersonalityId)) {
    return instanceActivePersonalityId;
  }
  return pinnedPersonalityId === NO_PERSONA
    ? null
    : (pinnedPersonalityId ?? null);
}
