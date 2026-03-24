-- AlterTable
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "authStateNonce" TEXT;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "authRequestedAt" DATETIME;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "authFailureReason" TEXT;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "providerAccessToken" TEXT;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "providerTokenType" TEXT;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "providerTokenExpiresAt" DATETIME;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "providerUserId" TEXT;
ALTER TABLE "ShopWhatsappConnection" ADD COLUMN "providerConnectedAt" DATETIME;
