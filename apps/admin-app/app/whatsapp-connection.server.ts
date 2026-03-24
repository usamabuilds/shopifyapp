import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";

export type MerchantWhatsappConnectionStatus =
  | "NOT_CONNECTED"
  | "INCOMPLETE_SETUP"
  | "MISCONFIGURED"
  | "SYNC_NEEDED"
  | "CONNECTED";

export type MerchantWhatsappSyncStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "IN_SYNC"
  | "NEEDS_ATTENTION"
  | "FAILED";

export type MerchantWhatsappConnectionInput = {
  businessAccountId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  configurationNotes: string | null;
  errorState: string | null;
  connectionStatus: MerchantWhatsappConnectionStatus;
  syncStatus: MerchantWhatsappSyncStatus;
  templateSyncRequested: boolean;
};

export type MerchantWhatsappConnectionState = {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  configurationNotes: string;
  errorState: string;
  connectionStatus: MerchantWhatsappConnectionStatus;
  syncStatus: MerchantWhatsappSyncStatus;
  lastSyncedAt: string | null;
  templateSyncRequested: boolean;
  updatedAt: string | null;
  readiness: {
    whatsappConnected: boolean;
    templatesReady: boolean;
    onboardingCurrentStep: string;
  };
};

type ConnectionRecord = {
  businessAccountId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  configurationNotes: string | null;
  errorState: string | null;
  connectionStatus: MerchantWhatsappConnectionStatus;
  syncStatus: MerchantWhatsappSyncStatus;
  lastSyncedAt: Date | null;
  templateSyncRequested: boolean;
  updatedAt: Date;
};

type PrismaDb = {
  shopWhatsappConnection: {
    upsert: (args: Record<string, unknown>) => Promise<ConnectionRecord>;
  };
  onboardingState: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaDb;

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function parseConnectionStatus(value: FormDataEntryValue | null): MerchantWhatsappConnectionStatus {
  if (
    value === "NOT_CONNECTED"
    || value === "INCOMPLETE_SETUP"
    || value === "MISCONFIGURED"
    || value === "SYNC_NEEDED"
    || value === "CONNECTED"
  ) {
    return value;
  }

  return "NOT_CONNECTED";
}

function parseSyncStatus(value: FormDataEntryValue | null): MerchantWhatsappSyncStatus {
  if (
    value === "NOT_STARTED"
    || value === "PENDING"
    || value === "IN_SYNC"
    || value === "NEEDS_ATTENTION"
    || value === "FAILED"
  ) {
    return value;
  }

  return "NOT_STARTED";
}

function parseBooleanFlag(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

function deriveConnectionStatus(input: MerchantWhatsappConnectionInput): MerchantWhatsappConnectionStatus {
  const hasConnectionIdentifiers = Boolean(input.businessAccountId) && Boolean(input.phoneNumberId);

  if (!hasConnectionIdentifiers) {
    return "NOT_CONNECTED";
  }

  if (input.errorState) {
    return "MISCONFIGURED";
  }

  if (!input.displayPhoneNumber) {
    return "INCOMPLETE_SETUP";
  }

  if (
    input.syncStatus === "NOT_STARTED"
    || input.syncStatus === "PENDING"
    || input.syncStatus === "NEEDS_ATTENTION"
    || input.syncStatus === "FAILED"
  ) {
    return "SYNC_NEEDED";
  }

  return "CONNECTED";
}

function deriveSyncStatus(input: MerchantWhatsappConnectionInput): MerchantWhatsappSyncStatus {
  if (input.errorState) {
    return "FAILED";
  }

  if (input.templateSyncRequested && input.syncStatus !== "IN_SYNC") {
    return "PENDING";
  }

  const hasConnectionIdentifiers = Boolean(input.businessAccountId) && Boolean(input.phoneNumberId);

  if (!hasConnectionIdentifiers) {
    return "NOT_STARTED";
  }

  return input.syncStatus;
}

function deriveLastSyncedAt(input: MerchantWhatsappConnectionInput, existingLastSyncedAt: Date | null): Date | null {
  if (input.syncStatus === "IN_SYNC" && !input.errorState) {
    return new Date();
  }

  return existingLastSyncedAt;
}

export function parseMerchantWhatsappConnectionFormData(formData: FormData): MerchantWhatsappConnectionInput {
  const baseInput: MerchantWhatsappConnectionInput = {
    businessAccountId: normalizeOptionalString(formData.get("businessAccountId")),
    phoneNumberId: normalizeOptionalString(formData.get("phoneNumberId")),
    displayPhoneNumber: normalizeOptionalString(formData.get("displayPhoneNumber")),
    configurationNotes: normalizeOptionalString(formData.get("configurationNotes")),
    errorState: normalizeOptionalString(formData.get("errorState")),
    connectionStatus: parseConnectionStatus(formData.get("connectionStatus")),
    syncStatus: parseSyncStatus(formData.get("syncStatus")),
    templateSyncRequested: parseBooleanFlag(formData.get("templateSyncRequested")),
  };

  const derivedSyncStatus = deriveSyncStatus(baseInput);
  const derivedConnectionStatus = deriveConnectionStatus({
    ...baseInput,
    syncStatus: derivedSyncStatus,
  });

  return {
    ...baseInput,
    syncStatus: derivedSyncStatus,
    connectionStatus: derivedConnectionStatus,
  };
}


function parseStoredConnectionStatus(value: string | null | undefined): MerchantWhatsappConnectionStatus {
  if (
    value === "NOT_CONNECTED"
    || value === "INCOMPLETE_SETUP"
    || value === "MISCONFIGURED"
    || value === "SYNC_NEEDED"
    || value === "CONNECTED"
  ) {
    return value;
  }

  return "NOT_CONNECTED";
}

function parseStoredSyncStatus(value: string | null | undefined): MerchantWhatsappSyncStatus {
  if (
    value === "NOT_STARTED"
    || value === "PENDING"
    || value === "IN_SYNC"
    || value === "NEEDS_ATTENTION"
    || value === "FAILED"
  ) {
    return value;
  }

  return "NOT_STARTED";
}

export async function getMerchantWhatsappConnectionState(
  shopDomain: string,
): Promise<MerchantWhatsappConnectionState> {
  const shop = await ensureShopFoundation(shopDomain);
  const connection = shop.whatsappConnection;

  return {
    businessAccountId: connection?.businessAccountId ?? "",
    phoneNumberId: connection?.phoneNumberId ?? "",
    displayPhoneNumber: connection?.displayPhoneNumber ?? "",
    configurationNotes: connection?.configurationNotes ?? "",
    errorState: connection?.errorState ?? "",
    connectionStatus: parseStoredConnectionStatus(connection?.connectionStatus),
    syncStatus: parseStoredSyncStatus(connection?.syncStatus),
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
    templateSyncRequested: connection?.templateSyncRequested ?? false,
    updatedAt: connection?.updatedAt.toISOString() ?? null,
    readiness: {
      whatsappConnected: shop.onboarding?.readinessWhatsappConnected ?? false,
      templatesReady: shop.onboarding?.readinessTemplatesReady ?? false,
      onboardingCurrentStep: shop.onboarding?.currentStep ?? "identity_confirmed",
    },
  };
}

export async function upsertMerchantWhatsappConnection(
  shopDomain: string,
  input: MerchantWhatsappConnectionInput,
) {
  const shop = await ensureShopFoundation(shopDomain);

  const syncStatus = deriveSyncStatus(input);
  const connectionStatus = deriveConnectionStatus({
    ...input,
    syncStatus,
  });
  const lastSyncedAt = deriveLastSyncedAt({
    ...input,
    syncStatus,
  }, shop.whatsappConnection?.lastSyncedAt ?? null);

  const connection = await db.shopWhatsappConnection.upsert({
    where: { shopId: shop.id },
    update: {
      businessAccountId: input.businessAccountId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      configurationNotes: input.configurationNotes,
      errorState: input.errorState,
      connectionStatus,
      syncStatus,
      templateSyncRequested: input.templateSyncRequested,
      lastSyncedAt,
    },
    create: {
      shopId: shop.id,
      businessAccountId: input.businessAccountId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      configurationNotes: input.configurationNotes,
      errorState: input.errorState,
      connectionStatus,
      syncStatus,
      templateSyncRequested: input.templateSyncRequested,
      lastSyncedAt,
    },
  });

  const readinessWhatsappConnected = connectionStatus === "CONNECTED" || connectionStatus === "SYNC_NEEDED";
  const readinessTemplatesReady = syncStatus === "IN_SYNC";

  const currentStep = readinessWhatsappConnected
    ? readinessTemplatesReady
      ? "whatsapp_ready"
      : "whatsapp_connected"
    : "whatsapp_setup_required";

  await db.onboardingState.upsert({
    where: { shopId: shop.id },
    update: {
      checklistIdentityComplete: true,
      readinessWhatsappConnected,
      readinessTemplatesReady,
      currentStep,
    },
    create: {
      shopId: shop.id,
      checklistIdentityComplete: true,
      readinessWhatsappConnected,
      readinessTemplatesReady,
      currentStep,
    },
  });

  return connection;
}
