import prisma from "./db.server";

type ShopRecord = {
  id: string;
  shopDomain: string;
  installedAt: Date;
  settings: {
    contactEmail: string | null;
    defaultCountry: string | null;
    timezone: string | null;
  } | null;
  onboarding: {
    currentStep: string;
    checklistIdentityComplete: boolean;
    checklistSettingsComplete: boolean;
    checklistBillingComplete: boolean;
    readinessSettingsConfigured: boolean;
    readinessWhatsappConnected: boolean;
    readinessTemplatesReady: boolean;
    readinessAutomationsReady: boolean;
  } | null;
};

type PrismaDelegate<T> = {
  upsert: (args: Record<string, unknown>) => Promise<T>;
};

type PrismaDb = {
  shop: PrismaDelegate<ShopRecord>;
  shopSettings: PrismaDelegate<{
    id: string;
    shopId: string;
    contactEmail: string | null;
    defaultCountry: string | null;
    timezone: string | null;
  }>;
  onboardingState: PrismaDelegate<{
    id: string;
    shopId: string;
  }>;
};

const db = prisma as unknown as PrismaDb;

export type ShopSettingsInput = {
  contactEmail: string | null;
  defaultCountry: string | null;
  timezone: string | null;
};

export type ShopOverviewState = {
  shopDomain: string;
  installedAt: Date;
  onboarding: {
    currentStep: string;
    checklist: {
      identityComplete: boolean;
      settingsComplete: boolean;
      billingComplete: boolean;
    };
    readiness: {
      settingsConfigured: boolean;
      whatsappConnected: boolean;
      templatesReady: boolean;
      automationsReady: boolean;
    };
  };
};

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function parseSettingsFormData(formData: FormData): ShopSettingsInput {
  return {
    contactEmail: normalizeOptionalString(formData.get("contactEmail")),
    defaultCountry: normalizeOptionalString(formData.get("defaultCountry")),
    timezone: normalizeOptionalString(formData.get("timezone")),
  };
}

export async function ensureShopFoundation(shopDomain: string) {
  return db.shop.upsert({
    where: { shopDomain },
    update: { appInstalled: true, uninstalledAt: null },
    create: {
      shopDomain,
      onboarding: {
        create: {
          checklistIdentityComplete: true,
          currentStep: "identity_confirmed",
        },
      },
    },
    include: {
      onboarding: true,
      settings: true,
    },
  });
}

export async function getShopOverviewState(
  shopDomain: string,
): Promise<ShopOverviewState> {
  const shop = await ensureShopFoundation(shopDomain);

  return {
    shopDomain: shop.shopDomain,
    installedAt: shop.installedAt,
    onboarding: {
      currentStep: shop.onboarding?.currentStep ?? "identity_confirmed",
      checklist: {
        identityComplete: shop.onboarding?.checklistIdentityComplete ?? true,
        settingsComplete: shop.onboarding?.checklistSettingsComplete ?? false,
        billingComplete: shop.onboarding?.checklistBillingComplete ?? false,
      },
      readiness: {
        settingsConfigured: shop.onboarding?.readinessSettingsConfigured ?? false,
        whatsappConnected: shop.onboarding?.readinessWhatsappConnected ?? false,
        templatesReady: shop.onboarding?.readinessTemplatesReady ?? false,
        automationsReady: shop.onboarding?.readinessAutomationsReady ?? false,
      },
    },
  };
}

export async function getShopSettings(shopDomain: string) {
  const shop = await ensureShopFoundation(shopDomain);

  return {
    contactEmail: shop.settings?.contactEmail ?? "",
    defaultCountry: shop.settings?.defaultCountry ?? "",
    timezone: shop.settings?.timezone ?? "",
  };
}

export async function upsertShopSettings(
  shopDomain: string,
  settingsInput: ShopSettingsInput,
) {
  const shop = await ensureShopFoundation(shopDomain);

  const hasAnySettingsValue = Boolean(
    settingsInput.contactEmail ||
      settingsInput.defaultCountry ||
      settingsInput.timezone,
  );

  const settings = await db.shopSettings.upsert({
    where: { shopId: shop.id },
    update: settingsInput,
    create: {
      shopId: shop.id,
      ...settingsInput,
    },
  });

  await db.onboardingState.upsert({
    where: { shopId: shop.id },
    update: {
      checklistIdentityComplete: true,
      checklistSettingsComplete: hasAnySettingsValue,
      readinessSettingsConfigured: hasAnySettingsValue,
      currentStep: hasAnySettingsValue ? "settings_started" : "identity_confirmed",
    },
    create: {
      shopId: shop.id,
      checklistIdentityComplete: true,
      checklistSettingsComplete: hasAnySettingsValue,
      readinessSettingsConfigured: hasAnySettingsValue,
      currentStep: hasAnySettingsValue ? "settings_started" : "identity_confirmed",
    },
  });

  return settings;
}
