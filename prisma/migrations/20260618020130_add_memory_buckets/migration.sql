-- CreateTable
CREATE TABLE "composio_claw_memory_bucket" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "alwaysInject" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_memory_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_memory_bucket_instanceId_idx" ON "composio_claw_memory_bucket"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_memory_bucket_instanceId_slug_key" ON "composio_claw_memory_bucket"("instanceId", "slug");

-- AddForeignKey
ALTER TABLE "composio_claw_memory_bucket" ADD CONSTRAINT "composio_claw_memory_bucket_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
