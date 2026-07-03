-- AlterTable
ALTER TABLE "composio_claw_cron_job" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qstashMessageId" TEXT;

-- CreateTable
CREATE TABLE "composio_claw_cron_run" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "resultText" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "composio_claw_cron_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_cron_run_jobId_startedAt_idx" ON "composio_claw_cron_run"("jobId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "composio_claw_cron_run_instanceId_startedAt_idx" ON "composio_claw_cron_run"("instanceId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "composio_claw_cron_run" ADD CONSTRAINT "composio_claw_cron_run_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "composio_claw_cron_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
