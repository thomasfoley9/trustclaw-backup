-- EA (Presence Mode) spine: task ledger, watch table, idempotency event log,
-- and the per-instance short-ID counter. Additive only.

-- AlterTable
ALTER TABLE "composio_claw_instance" ADD COLUMN "eaTaskCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "composio_claw_ea_task" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "shortId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "dueAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "draftRef" TEXT,
    "lastNudgedAt" TIMESTAMP(3),
    "nudgeCount" INTEGER NOT NULL DEFAULT 0,
    "escalationRung" INTEGER NOT NULL DEFAULT 0,
    "ackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_ea_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_ea_watch" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "chaseAfterHrs" INTEGER NOT NULL DEFAULT 24,
    "lastNudgedAt" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'watching',
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_claw_ea_watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composio_claw_ea_event" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composio_claw_ea_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composio_claw_ea_task_instanceId_status_dueAt_idx" ON "composio_claw_ea_task"("instanceId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_ea_task_instanceId_shortId_key" ON "composio_claw_ea_task"("instanceId", "shortId");

-- CreateIndex
CREATE INDEX "composio_claw_ea_watch_instanceId_state_lastActivityAt_idx" ON "composio_claw_ea_watch"("instanceId", "state", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_ea_watch_instanceId_kind_ref_key" ON "composio_claw_ea_watch"("instanceId", "kind", "ref");

-- CreateIndex
CREATE INDEX "composio_claw_ea_event_instanceId_kind_createdAt_idx" ON "composio_claw_ea_event"("instanceId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "composio_claw_ea_event_instanceId_fingerprint_key" ON "composio_claw_ea_event"("instanceId", "fingerprint");

-- AddForeignKey
ALTER TABLE "composio_claw_ea_task" ADD CONSTRAINT "composio_claw_ea_task_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_ea_watch" ADD CONSTRAINT "composio_claw_ea_watch_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composio_claw_ea_event" ADD CONSTRAINT "composio_claw_ea_event_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "composio_claw_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
