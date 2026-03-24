-- CreateTable
CREATE TABLE "ShopWhatsappTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "providerTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "header" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "footer" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopWhatsappTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopWhatsappTemplate_shopId_templateKey_key" ON "ShopWhatsappTemplate"("shopId", "templateKey");

-- CreateIndex
CREATE INDEX "ShopWhatsappTemplate_shopId_status_idx" ON "ShopWhatsappTemplate"("shopId", "status");
