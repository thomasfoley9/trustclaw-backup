import { describe, expect, it } from "vitest";
import {
  NO_PERSONA,
  isPersonaPinned,
  resolvePersonalityId,
  resolvePinnedPrompt,
} from "./persona-pin";

const RAMSAY = "clx_ramsay";
const ALFRED = "clx_alfred";

describe("isPersonaPinned", () => {
  it("is pinned for a real id and for the default-voice sentinel", () => {
    expect(isPersonaPinned(RAMSAY)).toBe(true);
    expect(isPersonaPinned(NO_PERSONA)).toBe(true);
  });

  it("is not pinned when absent (text chat, or a pre-pin call)", () => {
    expect(isPersonaPinned(null)).toBe(false);
    expect(isPersonaPinned(undefined)).toBe(false);
  });
});

describe("resolvePersonalityId", () => {
  it("follows the instance's current persona when unpinned", () => {
    // Text chat: a mid-conversation switch SHOULD take effect immediately.
    expect(resolvePersonalityId(null, ALFRED)).toBe(ALFRED);
    expect(resolvePersonalityId(undefined, ALFRED)).toBe(ALFRED);
    expect(resolvePersonalityId(null, null)).toBeNull();
  });

  it("holds the call's persona even after the user switches mid-call", () => {
    // The whole point: instance says Ramsay now, but the call was dispatched
    // as Alfred, so this run stays Alfred and the call stays coherent.
    expect(resolvePersonalityId(ALFRED, RAMSAY)).toBe(ALFRED);
  });

  it("pins to the default voice when the call started on it", () => {
    expect(resolvePersonalityId(NO_PERSONA, RAMSAY)).toBeNull();
  });

  it("keeps the pin when the instance has since cleared its persona", () => {
    expect(resolvePersonalityId(ALFRED, null)).toBe(ALFRED);
  });

  it("is a no-op when the pin already matches the instance", () => {
    expect(resolvePersonalityId(RAMSAY, RAMSAY)).toBe(RAMSAY);
  });
});

describe("resolvePinnedPrompt", () => {
  const SNAPSHOT = "You are Alfred, an unflappable butler.";

  it("replays the dispatch-time prompt for a pinned call", () => {
    // Survives the personality being EDITED mid-call: the row may say
    // something new, but the call keeps speaking what it was dispatched with.
    expect(resolvePinnedPrompt(ALFRED, SNAPSHOT)).toBe(SNAPSHOT);
  });

  it("survives the pinned personality being deleted mid-call", () => {
    // The row is gone, but the snapshot still carries the voice - without it
    // the delegate fell back to the default character mid-call.
    expect(resolvePinnedPrompt(ALFRED, SNAPSHOT)).toBe(SNAPSHOT);
  });

  it("returns null for the default-voice sentinel so the soul prompt applies", () => {
    expect(resolvePinnedPrompt(NO_PERSONA, null)).toBeNull();
  });

  it("returns null when unpinned, whatever prompt is passed", () => {
    expect(resolvePinnedPrompt(null, SNAPSHOT)).toBeNull();
    expect(resolvePinnedPrompt(undefined, SNAPSHOT)).toBeNull();
  });

  it("returns null for a pre-snapshot call that only has an id", () => {
    // Calls created between the two migrations: no snapshot, so the run falls
    // back to resolving the id - the previous behavior, not a crash.
    expect(resolvePinnedPrompt(ALFRED, null)).toBeNull();
  });
});
