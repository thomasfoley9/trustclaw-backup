// One-shot backfill: encrypt any plaintext secrets stored before ENCRYPTION_KEY
// was configured. Covers EVERY secret column, not just Composio keys:
//   composio_claw_instance:      composioApiKey, anthropicApiKey, voiceApiKey
//   composio_claw_custom_model:  providerApiKey
// Idempotent - values already in the `enc:v1:` format are skipped, so it's safe
// to run repeatedly.
//
// Run AFTER ENCRYPTION_KEY is set in BOTH this process AND the app (same key),
// or the app won't be able to decrypt what this writes:
//   ENCRYPTION_KEY=... DATABASE_URL=... node scripts/encrypt-composio-keys.mjs
// On Vercel/Neon use the unpooled URL (DATABASE_URL_UNPOOLED).
//
// The on-disk format MUST match src/server/clients/crypto.ts:
//   enc:v1:<ivB64>:<authTagB64>:<ciphertextB64>  (AES-256-GCM, 12-byte IV)
import { createCipheriv, randomBytes } from "node:crypto";
import pg from "pg";

const PREFIX = "enc:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;

// (table, column) pairs that hold an encryptable secret. Hardcoded constants -
// never interpolate untrusted input into these identifiers.
const TARGETS = [
  { table: "composio_claw_instance", column: "composioApiKey" },
  { table: "composio_claw_instance", column: "anthropicApiKey" },
  { table: "composio_claw_instance", column: "voiceApiKey" },
  { table: "composio_claw_custom_model", column: "providerApiKey" },
];

function loadKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    console.error("ENCRYPTION_KEY is not set - nothing to do. Set it and re-run.");
    process.exit(1);
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    console.error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}).`,
    );
    process.exit(1);
  }
  return buf;
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "enc:v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL set.");
  process.exit(1);
}

const key = loadKey();
const client = new pg.Client({ connectionString: url });

await client.connect();
try {
  let total = 0;
  for (const { table, column } of TARGETS) {
    const { rows } = await client.query(
      `SELECT id, "${column}" AS k
         FROM "${table}"
        WHERE "${column}" IS NOT NULL
          AND "${column}" NOT LIKE $1`,
      [`${PREFIX}%`],
    );
    for (const row of rows) {
      await client.query(
        `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
        [encrypt(row.k, key), row.id],
      );
    }
    if (rows.length > 0) {
      console.log(`Encrypted ${rows.length} ${table}.${column}`);
    }
    total += rows.length;
  }
  console.log(
    total === 0
      ? "No plaintext secrets to encrypt. Already up to date."
      : `Done - encrypted ${total} secret value(s).`,
  );
} finally {
  await client.end();
}
