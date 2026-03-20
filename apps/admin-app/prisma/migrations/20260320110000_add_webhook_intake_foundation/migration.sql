-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "externalEventId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "headersPayload" TEXT NOT NULL,
    "normalizedPayload" TEXT NOT NULL,
    "normalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "processingStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enqueuedAt" DATETIME,
    "processedAt" DATETIME,
    "failedAt" DATETIME,
    "failureReason" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "deadLetteredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookEvent_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookEventId" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deadLetteredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookQueueItem_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "WebhookEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_dedupeKey_key" ON "WebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_shopDomain_topic_receivedAt_idx" ON "WebhookEvent"("shopDomain", "topic", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_processingStatus_receivedAt_idx" ON "WebhookEvent"("processingStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookQueueItem_webhookEventId_key" ON "WebhookQueueItem"("webhookEventId");

-- CreateIndex
CREATE INDEX "WebhookQueueItem_status_availableAt_idx" ON "WebhookQueueItem"("status", "availableAt");
