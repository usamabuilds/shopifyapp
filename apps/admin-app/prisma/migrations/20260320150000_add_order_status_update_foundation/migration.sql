-- RedefineTable
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "defaultCountry" TEXT,
    "timezone" TEXT,
    "orderConfirmationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "orderConfirmationTemplateKey" TEXT,
    "orderStatusUpdatesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "orderStatusTemplatePartialFulfilled" TEXT,
    "orderStatusTemplateFulfilled" TEXT,
    "orderStatusTemplateOutForDelivery" TEXT,
    "orderStatusTemplateDelivered" TEXT,
    "orderStatusTemplateCancelled" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShopSettings" (
  "id", "shopId", "contactEmail", "defaultCountry", "timezone", "orderConfirmationEnabled", "orderConfirmationTemplateKey", "createdAt", "updatedAt"
)
SELECT
  "id", "shopId", "contactEmail", "defaultCountry", "timezone", "orderConfirmationEnabled", "orderConfirmationTemplateKey", "createdAt", "updatedAt"
FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "OrderStatusUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "statusType" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "stateReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "sourceTopic" TEXT NOT NULL,
    "sourceReference" TEXT,
    "templateKey" TEXT,
    "recipientPhone" TEXT,
    "normalizedPayload" TEXT NOT NULL,
    "outboundMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "failedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderStatusUpdate_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderStatusUpdate_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusUpdate_dedupeKey_key" ON "OrderStatusUpdate"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusUpdate_outboundMessageId_key" ON "OrderStatusUpdate"("outboundMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusUpdate_shopDomain_orderId_statusType_key" ON "OrderStatusUpdate"("shopDomain", "orderId", "statusType");

-- CreateIndex
CREATE INDEX "OrderStatusUpdate_shopDomain_state_createdAt_idx" ON "OrderStatusUpdate"("shopDomain", "state", "createdAt");
