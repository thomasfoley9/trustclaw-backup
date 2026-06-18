// One-shot backfill: encrypt any plaintext Composio API keys already stored on
// composio_claw_instance.composioApiKey. Idempotent — rows already in the
// `enc:v1:` format are skipped, so it's safe to run repeatedly.
//
// Run AFTER ENCRYPTION_KEY is set in the environment:
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

function loadKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    console.error(
      "ENCRYPTION_KEY is not set — nothing to do. Set it and re-run.",
    );
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
  const { rows } = await client.query(
    `SELECT id, "composioApiKey" AS k
       FROM composio_claw_instance
      WHERE "composioApiKey" IS NOT NULL
        AND "composioApiKey" NOT LIKE $1`,
    [`${PREFIX}%`],
  );

  if (rows.length === 0) {
    console.log("No plaintext Composio keys to encrypt. Already up to date.");
  } else {
    for (const row of rows) {
      await client.query(
        `UPDATE composio_claw_instance SET "composioApiKey" = $1 WHERE id = $2`,
        [encrypt(row.k, key), row.id],
      );
    }
    console.log(`Encrypted ${rows.length} Composio key(s).`);
  }
} finally {
  await client.end();
}
