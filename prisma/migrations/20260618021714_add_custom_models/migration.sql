-- CreateTable
CREATE TABLE "composio_claw_custom_model" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerApiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_custom_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_custom_model_instanceId_idx" ON "composio_claw_custom_model"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_custom_model_instanceId_modelId_key" ON "composio_claw_custom_model"("instanceId", "modelId");

-- AddForeignKey
ALTER TABLE "composio_claw_custom_model" ADD CONSTRAINT "composio_claw_custom_model_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
