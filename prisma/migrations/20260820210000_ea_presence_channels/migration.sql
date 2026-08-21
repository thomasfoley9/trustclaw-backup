-- EA (Presence Mode) channels: master kill switch, per-channel toggles and
-- state, EA system-job marker, and the new message sources. Additive only.

-- AlterEnum
ALTER TYPE "MessageSource" ADD VALUE 'sms';
ALTER TYPE "MessageSource" ADD VALUE 'slack';
ALTER TYPE "MessageSource" ADD VALUE 'voice_call';

-- AlterTable
ALTER TABLE "composio_claw_instance" ADD COLUMN "presenceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaSlackEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaSlackChannelId" TEXT;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaSlackCursorTs" TEXT;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaSmsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaPhoneNumber" TEXT;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaPhoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaPhoneVerifyCode" TEXT;
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaPhoneVerifyExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "composio_claw_cron_job" ADD COLUMN "systemKind" TEXT;
