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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShopSettings" ("contactEmail", "createdAt", "defaultCountry", "id", "shopId", "timezone", "updatedAt") SELECT "contactEmail", "createdAt", "defaultCountry", "id", "shopId", "timezone", "updatedAt" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "OrderConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "templateKey" TEXT,
    "recipientPhone" TEXT,
    "normalizedOrderPayload" TEXT NOT NULL,
    "outboundMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "failedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderConfirmation_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderConfirmation_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderConfirmation_outboundMessageId_key" ON "OrderConfirmation"("outboundMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderConfirmation_shopDomain_orderId_key" ON "OrderConfirmation"("shopDomain", "orderId");

-- CreateIndex
CREATE INDEX "OrderConfirmation_shopDomain_status_createdAt_idx" ON "OrderConfirmation"("shopDomain", "status", "createdAt");
