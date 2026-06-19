// Envelope encryption for secrets at rest (currently per-user Composio API
// keys on ComposioClawInstance). AES-256-GCM via node:crypto.
//
// Stored format:  enc:v1:<ivB64>:<authTagB64>:<ciphertextB64>
// The `enc:v1:` prefix is unambiguous — real Composio keys are `ak_`/`uak_`
// and never collide with it. This lets us detect encrypted vs legacy-plaintext
// values and migrate the latter in place.
//
// Key source: env.ENCRYPTION_KEY (32 bytes, hex or canonical base64). When it
// is NOT set in local dev, encryptSecret is a passthrough (stores plaintext) so
// keyless dev keeps working. In production a missing key is a hard error — we
// fail closed rather than silently persist secrets in cleartext.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "~/env";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey: Buffer | null | undefined;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    // Fail closed in production: never silently downgrade secrets to plaintext
    // because someone forgot/typo'd the env var. Local dev may run keyless.
    if (env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY is required in production to encrypt secrets at rest. " +
          "Generate one with: openssl rand -base64 32",
      );
    }
    cachedKey = null;
    return cachedKey;
  }

  // Accept 64 hex chars or base64 (whitespace already trimmed). The decoded
  // length must be exactly 32 bytes — that catches a malformed key without
  // rejecting a valid-but-non-canonical one (e.g. a trailing newline on the env
  // var, which Buffer.from tolerates).
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}). ` +
        "Generate one with: openssl rand -base64 32",
    );
  }
  cachedKey = buf;
  return cachedKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

// Encrypts plaintext when ENCRYPTION_KEY is configured. In keyless local dev it
// returns the value unchanged (passthrough); in production getKey() throws, so a
// secret is never written in cleartext by accident.
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1), // "enc:v1"
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

// Decrypts a stored value. Legacy plaintext (no prefix) is returned as-is so
// rows written before encryption keep working until the migration runs.
// Throws if the value is encrypted but the key is missing or wrong.
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const key = getKey();
  if (!key) {
    throw new Error(
      "Value is encrypted but ENCRYPTION_KEY is not set; cannot decrypt.",
    );
  }

  // enc:v1:<iv>:<tag>:<ct>  → split into exactly 5 parts so a ':' inside
  // base64 (there isn't one, but be defensive) can't corrupt parsing.
  const parts = stored.split(":");
  if (parts.length !== 5) {
    throw new Error("Malformed encrypted value.");
  }
  const [, , ivB64, tagB64, ctB64] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
