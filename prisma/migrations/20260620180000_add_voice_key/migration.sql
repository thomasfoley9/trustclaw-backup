-- AlterTable
ALTER TABLE "composio_claw_instance" ADD COLUMN     "voiceApiKey" TEXT,
ADD COLUMN     "voiceId" TEXT NOT NULL DEFAULT 'avery';
