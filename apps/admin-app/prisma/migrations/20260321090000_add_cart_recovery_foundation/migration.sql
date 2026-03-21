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
    "cartRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cartRecoveryTemplateKey" TEXT,
    "cartRecoveryWaitMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShopSettings" (
  "id", "shopId", "contactEmail", "defaultCountry", "timezone", "orderConfirmationEnabled", "orderConfirmationTemplateKey", "orderStatusUpdatesEnabled", "orderStatusTemplatePartialFulfilled", "orderStatusTemplateFulfilled", "orderStatusTemplateOutForDelivery", "orderStatusTemplateDelivered", "orderStatusTemplateCancelled", "createdAt", "updatedAt"
)
SELECT
  "id", "shopId", "contactEmail", "defaultCountry", "timezone", "orderConfirmationEnabled", "orderConfirmationTemplateKey", "orderStatusUpdatesEnabled", "orderStatusTemplatePartialFulfilled", "orderStatusTemplateFulfilled", "orderStatusTemplateOutForDelivery", "orderStatusTemplateDelivered", "orderStatusTemplateCancelled", "createdAt", "updatedAt"
FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "CartRecovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "cartToken" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING_WAIT',
    "stateReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "customerId" TEXT,
    "templateKey" TEXT,
    "checkoutSubtotalAmount" TEXT,
    "checkoutCurrencyCode" TEXT,
    "normalizedPayload" TEXT NOT NULL,
    "recoveryEligibleAt" DATETIME NOT NULL,
    "lastEvaluatedAt" DATETIME,
    "outboundMessageId" TEXT,
    "sentAt" DATETIME,
    "processedAt" DATETIME,
    "failedAt" DATETIME,
    "recoveredAt" DATETIME,
    "recoveredOrderId" TEXT,
    "recoveredOrderNumber" TEXT,
    "recoveredRevenueAmount" TEXT,
    "recoveredCurrencyCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CartRecovery_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartRecovery_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CartRecovery_dedupeKey_key" ON "CartRecovery"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "CartRecovery_outboundMessageId_key" ON "CartRecovery"("outboundMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CartRecovery_shopDomain_checkoutId_key" ON "CartRecovery"("shopDomain", "checkoutId");

-- CreateIndex
CREATE INDEX "CartRecovery_shopDomain_state_recoveryEligibleAt_idx" ON "CartRecovery"("shopDomain", "state", "recoveryEligibleAt");

-- CreateIndex
CREATE INDEX "CartRecovery_shopDomain_recoveredAt_idx" ON "CartRecovery"("shopDomain", "recoveredAt");
