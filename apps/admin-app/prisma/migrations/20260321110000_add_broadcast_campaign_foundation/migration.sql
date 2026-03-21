-- CreateTable
CREATE TABLE "CampaignSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultTemplateKey" TEXT,
    "dispatchBatchSize" INTEGER NOT NULL DEFAULT 20,
    "throttleMsBetweenMessages" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BroadcastCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "templateKey" TEXT,
    "audienceType" TEXT NOT NULL,
    "audienceQuery" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "scheduleAt" DATETIME,
    "sendNowRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME,
    "lastDispatchAt" DATETIME,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentRecipients" INTEGER NOT NULL DEFAULT 0,
    "failedRecipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BroadcastCampaign_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BroadcastCampaignRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "stateReason" TEXT,
    "outboundMessageId" TEXT,
    "dispatchAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastDispatchedAt" DATETIME,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BroadcastCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BroadcastCampaignRecipient_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BroadcastCampaignRecipient_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BroadcastCampaignDispatchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BroadcastCampaignDispatchLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BroadcastCampaignDispatchLog_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSettings_shopId_key" ON "CampaignSettings"("shopId");

-- CreateIndex
CREATE INDEX "BroadcastCampaign_shopDomain_status_scheduleAt_idx" ON "BroadcastCampaign"("shopDomain", "status", "scheduleAt");

-- CreateIndex
CREATE INDEX "BroadcastCampaign_shopDomain_createdAt_idx" ON "BroadcastCampaign"("shopDomain", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastCampaignRecipient_dedupeKey_key" ON "BroadcastCampaignRecipient"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastCampaignRecipient_outboundMessageId_key" ON "BroadcastCampaignRecipient"("outboundMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastCampaignRecipient_campaignId_recipientAddress_key" ON "BroadcastCampaignRecipient"("campaignId", "recipientAddress");

-- CreateIndex
CREATE INDEX "BroadcastCampaignRecipient_campaignId_state_createdAt_idx" ON "BroadcastCampaignRecipient"("campaignId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastCampaignRecipient_shopDomain_state_updatedAt_idx" ON "BroadcastCampaignRecipient"("shopDomain", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "BroadcastCampaignDispatchLog_shopDomain_createdAt_idx" ON "BroadcastCampaignDispatchLog"("shopDomain", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastCampaignDispatchLog_campaignId_createdAt_idx" ON "BroadcastCampaignDispatchLog"("campaignId", "createdAt");
