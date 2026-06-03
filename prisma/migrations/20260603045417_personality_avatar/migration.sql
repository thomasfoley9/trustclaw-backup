-- DropIndex
DROP INDEX "composio_claw_memory_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "composio_claw_personality" ADD COLUMN     "avatarKey" TEXT;
