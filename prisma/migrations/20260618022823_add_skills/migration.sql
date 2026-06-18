-- CreateTable
CREATE TABLE "composio_claw_skill" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whenToUse" TEXT NOT NULL,
    "instructions" TEXT[],
    "requiredInputs" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_skill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_skill_instanceId_idx" ON "composio_claw_skill"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_skill_instanceId_name_key" ON "composio_claw_skill"("instanceId", "name");

-- AddForeignKey
ALTER TABLE "composio_claw_skill" ADD CONSTRAINT "composio_claw_skill_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
