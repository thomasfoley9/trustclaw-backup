-- AlterTable
ALTER TABLE "composio_claw_instance" ALTER COLUMN "voiceId" SET DEFAULT 'marin';

-- CreateTable
CREATE TABLE "composio_claw_generated_image" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composio_claw_generated_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_generated_image_instanceId_idx" ON "composio_claw_generated_image"("instanceId");

-- AddForeignKey
ALTER TABLE "composio_claw_generated_image" ADD CONSTRAINT "composio_claw_generated_image_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
