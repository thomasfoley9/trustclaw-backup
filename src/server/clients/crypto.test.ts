import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// crypto.ts reads env.ENCRYPTION_KEY / env.NODE_ENV once and caches the
// derived key at module scope, so every scenario loads a FRESH copy of the
// module with a mocked ~/env driving the branch under test.
async function loadCrypto(envValues: {
  NODE_ENV: "development" | "test" | "production";
  ENCRYPTION_KEY?: string;
}) {
  vi.resetModules();
  vi.doMock("~/env", () => ({ env: envValues }));
  return import("./crypto");
}

const KEY_B64 = randomBytes(32).toString("base64");
const KEY_HEX = randomBytes(32).toString("hex");

afterEach(() => {
  vi.doUnmock("~/env");
  vi.resetModules();
});

describe("isEncrypted", () => {
  it("detects the enc:v1: prefix", async () => {
    const { isEncrypted } = await loadCrypto({ NODE_ENV: "test" });
    expect(isEncrypted("enc:v1:aaa:bbb:ccc")).toBe(true);
  });

  it("treats legacy plaintext Composio keys as not encrypted", async () => {
    const { isEncrypted } = await loadCrypto({ NODE_ENV: "test" });
    expect(isEncrypted("ak_live_1234567890")).toBe(false);
    expect(isEncrypted("uak_1234567890")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    // Near-miss prefixes must not count as encrypted.
    expect(isEncrypted("enc:v2:x:y:z")).toBe(false);
    expect(isEncrypted("ENC:V1:x:y:z")).toBe(false);
  });
});

describe("keyless local dev (no ENCRYPTION_KEY)", () => {
  it("encryptSecret is a passthrough", async () => {
    const { encryptSecret } = await loadCrypto({ NODE_ENV: "development" });
    expect(encryptSecret("ak_plain")).toBe("ak_plain");
  });

  it("decryptSecret passes legacy plaintext through", async () => {
    const { decryptSecret } = await loadCrypto({ NODE_ENV: "development" });
    expect(decryptSecret("ak_plain")).toBe("ak_plain");
  });

  it("decryptSecret throws on an encrypted value it cannot decrypt", async () => {
    const withKey = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    const stored = withKey.encryptSecret("secret");

    const withoutKey = await loadCrypto({ NODE_ENV: "development" });
    expect(() => withoutKey.decryptSecret(stored)).toThrow(
      /ENCRYPTION_KEY is not set/,
    );
  });
});

describe("fail closed in production", () => {
  it("encryptSecret throws instead of storing plaintext", async () => {
    const { encryptSecret } = await loadCrypto({ NODE_ENV: "production" });
    expect(() => encryptSecret("ak_secret")).toThrow(
      /ENCRYPTION_KEY is required in production/,
    );
  });

  it("works normally in production when the key is present", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto({
      NODE_ENV: "production",
      ENCRYPTION_KEY: KEY_B64,
    });
    expect(decryptSecret(encryptSecret("ak_secret"))).toBe("ak_secret");
  });
});

describe("roundtrip with a key", () => {
  it("encrypts to the enc:v1: format and decrypts back (base64 key)", async () => {
    const { encryptSecret, decryptSecret, isEncrypted } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    const stored = encryptSecret("ak_live_supersecret");
    expect(stored).not.toBe("ak_live_supersecret");
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored.split(":")).toHaveLength(5);
    expect(decryptSecret(stored)).toBe("ak_live_supersecret");
  });

  it("accepts a 64-char hex key", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_HEX,
    });
    expect(decryptSecret(encryptSecret("hunter2"))).toBe("hunter2");
  });

  it("tolerates surrounding whitespace on the key", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: `  ${KEY_B64}\n`,
    });
    expect(decryptSecret(encryptSecret("s3cret"))).toBe("s3cret");
  });

  it("roundtrips unicode plaintext", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    const value = "pässwörd 密码 🔐";
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it("produces a different ciphertext per call (random IV)", async () => {
    const { encryptSecret } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("does not double-encrypt when callers gate on isEncrypted", async () => {
    const { encryptSecret, isEncrypted } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    const once = encryptSecret("ak_live_x");
    // The migration pattern: only encrypt rows that are not yet encrypted.
    const migrated = isEncrypted(once) ? once : encryptSecret(once);
    expect(migrated).toBe(once);
  });
});

describe("bad inputs", () => {
  it("rejects a key that does not decode to 32 bytes", async () => {
    const { encryptSecret } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: Buffer.from("short").toString("base64"),
    });
    expect(() => encryptSecret("x")).toThrow(/must decode to 32 bytes/);
  });

  it("rejects a malformed encrypted value", async () => {
    const { decryptSecret } = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    expect(() => decryptSecret("enc:v1:only-two-parts")).toThrow(
      /Malformed encrypted value/,
    );
  });

  it("fails GCM auth when decrypting with the wrong key", async () => {
    const first = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: KEY_B64,
    });
    const stored = first.encryptSecret("secret");

    const second = await loadCrypto({
      NODE_ENV: "test",
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    });
    expect(() => second.decryptSecret(stored)).toThrow();
  });
});
