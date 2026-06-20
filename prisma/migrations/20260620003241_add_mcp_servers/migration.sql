-- CreateTable
CREATE TABLE "composio_claw_mcp_server" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_mcp_server_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_mcp_server_instanceId_idx" ON "composio_claw_mcp_server"("instanceId");

-- AddForeignKey
ALTER TABLE "composio_claw_mcp_server" ADD CONSTRAINT "composio_claw_mcp_server_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
