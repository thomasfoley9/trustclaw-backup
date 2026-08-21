-- EA security hardening (pre-go-live audit fixes). Additive + one partial
-- unique index. Nullable/defaulted columns, no rewrite.

-- Brute-force cap on the SMS verification code.
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaPhoneVerifyAttempts" INTEGER NOT NULL DEFAULT 0;

-- Owner Slack identity gate for inbound #ea messages.
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaSlackOwnerUserId" TEXT;

-- One verified phone number can belong to at most one instance. Partial so
-- that many rows with NULL/unverified numbers are unconstrained. Prevents the
-- takeover/collision routing where two instances share a verified number.
CREATE UNIQUE INDEX "composio_claw_instance_verified_phone_key"
  ON "composio_claw_instance" ("eaPhoneNumber")
  WHERE "eaPhoneVerifiedAt" IS NOT NULL;
