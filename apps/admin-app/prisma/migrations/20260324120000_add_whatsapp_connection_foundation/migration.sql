-- CreateTable
CREATE TABLE "ShopWhatsappConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "businessAccountId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneNumber" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "syncStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "lastSyncedAt" DATETIME,
    "configurationNotes" TEXT,
    "errorState" TEXT,
    "templateSyncRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopWhatsappConnection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopWhatsappConnection_shopId_key" ON "ShopWhatsappConnection"("shopId");
