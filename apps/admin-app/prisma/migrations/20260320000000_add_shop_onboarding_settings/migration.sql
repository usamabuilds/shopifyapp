-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "uninstalledAt" DATETIME,
    "appInstalled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "defaultCountry" TEXT,
    "timezone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'identity_confirmed',
    "checklistIdentityComplete" BOOLEAN NOT NULL DEFAULT true,
    "checklistSettingsComplete" BOOLEAN NOT NULL DEFAULT false,
    "checklistBillingComplete" BOOLEAN NOT NULL DEFAULT false,
    "readinessSettingsConfigured" BOOLEAN NOT NULL DEFAULT false,
    "readinessWhatsappConnected" BOOLEAN NOT NULL DEFAULT false,
    "readinessTemplatesReady" BOOLEAN NOT NULL DEFAULT false,
    "readinessAutomationsReady" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingState_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_shopId_key" ON "OnboardingState"("shopId");
