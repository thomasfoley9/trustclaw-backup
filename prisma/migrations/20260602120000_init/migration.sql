-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('web', 'telegram', 'cron');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('regular', 'compaction_summary', 'memory_flush', 'hidden');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "username" TEXT,
    "displayUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_instance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anthropicModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    "activeMemoryBucket" TEXT NOT NULL DEFAULT 'general',
    "incognitoMode" BOOLEAN NOT NULL DEFAULT false,
    "activePersonalityId" TEXT,
    "telegramChatId" TEXT,
    "telegramLinkToken" TEXT,
    "telegramLinkTokenExpiresAt" TIMESTAMP(3),
    "soulPrompt" TEXT,
    "identityPrompt" TEXT,
    "userPrompt" TEXT,
    "compactionCount" INTEGER NOT NULL DEFAULT 0,
    "lastCompactionSummary" TEXT,
    "lastCompactionAt" TIMESTAMP(3),
    "tokensAtCompaction" INTEGER,
    "memoryFlushCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_personality" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "emoji" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_personality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_message" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "source" "MessageSource" NOT NULL DEFAULT 'web',
    "messageType" "MessageType" NOT NULL DEFAULT 'regular',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composio_claw_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_memory" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "embedding" VECTOR(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composio_claw_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_cron_job" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,

    CONSTRAINT "composio_claw_cron_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "writingStyle" TEXT,
    "personality" TEXT,
    "emoji" TEXT,
    "lore" TEXT NOT NULL DEFAULT '',
    "anthropicModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_instance_userId_key" ON "composio_claw_instance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_instance_telegramChatId_key" ON "composio_claw_instance"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_instance_telegramLinkToken_key" ON "composio_claw_instance"("telegramLinkToken");

-- CreateIndex
CREATE INDEX "composio_claw_instance_userId_idx" ON "composio_claw_instance"("userId");

-- CreateIndex
CREATE INDEX "composio_claw_personality_instanceId_idx" ON "composio_claw_personality"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_personality_instanceId_name_key" ON "composio_claw_personality"("instanceId", "name");

-- CreateIndex
CREATE INDEX "composio_claw_message_instanceId_createdAt_idx" ON "composio_claw_message"("instanceId", "createdAt");

-- CreateIndex
CREATE INDEX "composio_claw_memory_instanceId_createdAt_idx" ON "composio_claw_memory"("instanceId", "createdAt");

-- CreateIndex
CREATE INDEX "composio_claw_memory_instanceId_category_idx" ON "composio_claw_memory"("instanceId", "category");

-- CreateIndex
CREATE INDEX "composio_claw_cron_job_instanceId_nextRunAt_idx" ON "composio_claw_cron_job"("instanceId", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_state_userId_key" ON "onboarding_state"("userId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_instance" ADD CONSTRAINT "composio_claw_instance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_personality" ADD CONSTRAINT "composio_claw_personality_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_message" ADD CONSTRAINT "composio_claw_message_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_memory" ADD CONSTRAINT "composio_claw_memory_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_cron_job" ADD CONSTRAINT "composio_claw_cron_job_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_state" ADD CONSTRAINT "onboarding_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
