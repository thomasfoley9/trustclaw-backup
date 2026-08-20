-- AlterTable
ALTER TABLE "composio_claw_instance" ADD COLUMN     "activeConversationId" TEXT;

-- AlterTable
ALTER TABLE "composio_claw_message" ADD COLUMN     "conversationId" TEXT;

-- CreateTable
CREATE TABLE "composio_claw_conversation" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "compactionCount" INTEGER NOT NULL DEFAULT 0,
    "lastCompactionSummary" TEXT,
    "lastCompactionAt" TIMESTAMP(3),
    "tokensAtCompaction" INTEGER,
    "memoryFlushCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composio_claw_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_conversation_instanceId_lastMessageAt_idx" ON "composio_claw_conversation"("instanceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "composio_claw_message_conversationId_createdAt_idx" ON "composio_claw_message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "composio_claw_conversation" ADD CONSTRAINT "composio_claw_conversation_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_message" ADD CONSTRAINT "composio_claw_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "composio_claw_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Data backfill: every existing instance gets a "Main" conversation carrying
-- its current compaction state; all existing messages attach to it; the
-- instance's active session points at it. Preserves existing chat history.
-- ============================================================================
WITH new_conv AS (
  INSERT INTO "composio_claw_conversation"
    ("id", "instanceId", "title", "compactionCount", "lastCompactionSummary", "lastCompactionAt", "tokensAtCompaction", "memoryFlushCount", "createdAt", "updatedAt", "lastMessageAt")
  SELECT gen_random_uuid()::text, i."id", 'Main',
         i."compactionCount", i."lastCompactionSummary", i."lastCompactionAt", i."tokensAtCompaction", i."memoryFlushCount",
         i."createdAt", NOW(), NOW()
  FROM "composio_claw_instance" i
  RETURNING "id", "instanceId"
)
UPDATE "composio_claw_instance" i
SET "activeConversationId" = nc."id"
FROM new_conv nc
WHERE nc."instanceId" = i."id";

UPDATE "composio_claw_message" m
SET "conversationId" = c."id"
FROM "composio_claw_conversation" c
WHERE c."instanceId" = m."instanceId" AND m."conversationId" IS NULL;

UPDATE "composio_claw_conversation" c
SET "lastMessageAt" = COALESCE(sub.max_created, c."createdAt")
FROM (
  SELECT "conversationId", MAX("createdAt") AS max_created
  FROM "composio_claw_message"
  GROUP BY "conversationId"
) sub
WHERE sub."conversationId" = c."id";
