import crypto from "node:crypto";

import prisma from "./db.server";
import { logOperationalEvent } from "./observability.server";
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

export type MerchantWhatsappAuthStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "INCOMPLETE"
  | "FAILED"
  | "CONNECTED";

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
  authStatus: MerchantWhatsappAuthStatus;
  authFailureReason: string;
  providerConnectedAt: string | null;
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
  id: string;
  businessAccountId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  configurationNotes: string | null;
  errorState: string | null;
  connectionStatus: MerchantWhatsappConnectionStatus;
  syncStatus: MerchantWhatsappSyncStatus;
  lastSyncedAt: Date | null;
  templateSyncRequested: boolean;
  authStateNonce: string | null;
  authRequestedAt: Date | null;
  authFailureReason: string | null;
  providerAccessToken: string | null;
  providerConnectedAt: Date | null;
  updatedAt: Date;
};

type PrismaDb = {
  shopWhatsappConnection: {
    upsert: (args: Record<string, unknown>) => Promise<ConnectionRecord>;
    update: (args: Record<string, unknown>) => Promise<ConnectionRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<ConnectionRecord | null>;
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

function deriveAuthStatus(connection: ConnectionRecord | null): MerchantWhatsappAuthStatus {
  if (!connection) {
    return "NOT_STARTED";
  }

  if (connection.providerAccessToken) {
    const hasIdentifiers = Boolean(connection.businessAccountId) && Boolean(connection.phoneNumberId);
    return hasIdentifiers ? "CONNECTED" : "INCOMPLETE";
  }

  if (connection.authFailureReason) {
    return "FAILED";
  }

  if (connection.authStateNonce) {
    return "IN_PROGRESS";
  }

  return "NOT_STARTED";
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

function getMetaConfig() {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const baseUrl = process.env.SHOPIFY_APP_URL?.trim() ?? "";

  return {
    appId,
    appSecret,
    redirectUri: baseUrl ? `${baseUrl}/app/whatsapp/callback` : "",
    enabled: Boolean(appId && appSecret && baseUrl),
  };
}

export function getMetaConnectionAvailability() {
  const config = getMetaConfig();

  if (config.enabled) {
    return { enabled: true as const, reason: null };
  }

  return {
    enabled: false as const,
    reason: "Meta OAuth is unavailable. Configure META_APP_ID, META_APP_SECRET, and SHOPIFY_APP_URL.",
  };
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

export async function getMerchantWhatsappConnectionState(
  shopDomain: string,
): Promise<MerchantWhatsappConnectionState> {
  const shop = await ensureShopFoundation(shopDomain);
  const connection = shop.whatsappConnection as ConnectionRecord | null;

  return {
    businessAccountId: connection?.businessAccountId ?? "",
    phoneNumberId: connection?.phoneNumberId ?? "",
    displayPhoneNumber: connection?.displayPhoneNumber ?? "",
    configurationNotes: connection?.configurationNotes ?? "",
    errorState: connection?.errorState ?? "",
    authStatus: deriveAuthStatus(connection),
    authFailureReason: connection?.authFailureReason ?? "",
    providerConnectedAt: connection?.providerConnectedAt?.toISOString() ?? null,
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

export async function startMetaWhatsappAuth(shopDomain: string): Promise<{ ok: true; authUrl: string } | { ok: false; reason: string }> {
  const config = getMetaConfig();

  if (!config.enabled) {
    return { ok: false, reason: "Meta OAuth is unavailable. Configure META_APP_ID, META_APP_SECRET, and SHOPIFY_APP_URL." };
  }

  const shop = await ensureShopFoundation(shopDomain);
  const nonce = crypto.randomUUID();

  await db.shopWhatsappConnection.upsert({
    where: { shopId: shop.id },
    update: {
      authStateNonce: nonce,
      authRequestedAt: new Date(),
      authFailureReason: null,
      errorState: null,
    },
    create: {
      shopId: shop.id,
      authStateNonce: nonce,
      authRequestedAt: new Date(),
      authFailureReason: null,
    },
  });

  const statePayload = Buffer.from(JSON.stringify({
    shopDomain,
    nonce,
  })).toString("base64url");

  const authUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth");
  authUrl.searchParams.set("client_id", config.appId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "business_management,whatsapp_business_management,whatsapp_business_messaging");
  authUrl.searchParams.set("state", statePayload);

  logOperationalEvent({
    domain: "whatsapp_connection",
    event: "meta_auth_started",
    shopDomain,
    metadata: {
      redirectUri: config.redirectUri,
    },
  });

  return { ok: true, authUrl: authUrl.toString() };
}

type CompleteMetaAuthInput = {
  shopDomain: string;
  state: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  businessAccountId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
};

export async function completeMetaWhatsappAuth(input: CompleteMetaAuthInput): Promise<{ ok: true; status: MerchantWhatsappAuthStatus; message: string } | { ok: false; message: string }> {
  const config = getMetaConfig();

  if (!config.enabled) {
    return { ok: false, message: "Meta OAuth is unavailable. Configure META_APP_ID, META_APP_SECRET, and SHOPIFY_APP_URL." };
  }

  const shop = await ensureShopFoundation(input.shopDomain);
  const connection = await db.shopWhatsappConnection.findUnique({ where: { shopId: shop.id } });

  if (!connection) {
    return { ok: false, message: "Missing connection state. Start the Meta connection flow again." };
  }

  if (!input.state) {
    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: "Missing OAuth state in callback.",
        authStateNonce: null,
      },
    });

    return { ok: false, message: "Missing OAuth state in callback. Try reconnecting." };
  }

  let parsedState: { shopDomain?: string; nonce?: string } = {};

  try {
    parsedState = JSON.parse(Buffer.from(input.state, "base64url").toString("utf8"));
  } catch {
    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: "Invalid OAuth state payload.",
        authStateNonce: null,
      },
    });

    return { ok: false, message: "Invalid OAuth callback state. Start the connection flow again." };
  }

  if (parsedState.shopDomain !== input.shopDomain || parsedState.nonce !== connection.authStateNonce) {
    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: "OAuth state verification failed.",
        authStateNonce: null,
      },
    });

    return { ok: false, message: "State verification failed. Start the connection flow again." };
  }

  if (input.error) {
    const failureReason = [input.error, input.errorDescription].filter(Boolean).join(": ") || "Provider authorization rejected.";

    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: failureReason,
        errorState: failureReason,
        authStateNonce: null,
      },
    });

    logOperationalEvent({
      domain: "whatsapp_connection",
      event: "meta_auth_failed",
      level: "warn",
      shopDomain: input.shopDomain,
      reason: failureReason,
    });

    return { ok: false, message: `Meta authorization failed: ${failureReason}` };
  }

  if (!input.code) {
    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: "Missing authorization code.",
        authStateNonce: null,
      },
    });

    return { ok: false, message: "Missing authorization code in callback." };
  }

  const tokenUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", input.code);

  const tokenResponse = await fetch(tokenUrl, { method: "GET" });

  if (!tokenResponse.ok) {
    const tokenErrorText = await tokenResponse.text();
    const reason = `Token exchange failed (${tokenResponse.status}): ${tokenErrorText.slice(0, 300)}`;

    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: reason,
        errorState: reason,
        authStateNonce: null,
      },
    });

    logOperationalEvent({
      domain: "whatsapp_connection",
      event: "meta_auth_token_exchange_failed",
      level: "error",
      shopDomain: input.shopDomain,
      reason,
    });

    return { ok: false, message: "Meta token exchange failed. Check support logs and retry." };
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string; expires_in?: number; token_type?: string };

  if (!tokenPayload.access_token) {
    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        authFailureReason: "Token exchange did not return an access token.",
        authStateNonce: null,
      },
    });

    return { ok: false, message: "Meta token exchange did not return an access token." };
  }

  const profileUrl = new URL("https://graph.facebook.com/v22.0/me");
  profileUrl.searchParams.set("fields", "id,name");
  profileUrl.searchParams.set("access_token", tokenPayload.access_token);

  const meResponse = await fetch(profileUrl, { method: "GET" });
  const mePayload = meResponse.ok
    ? await meResponse.json() as { id?: string }
    : null;

  const hasAssetIds = Boolean(input.businessAccountId) && Boolean(input.phoneNumberId);
  const message = hasAssetIds
    ? "Meta connected. WhatsApp business assets were captured from callback."
    : "Meta connected. Select or sync WhatsApp business assets to finish setup.";

  await db.shopWhatsappConnection.update({
    where: { id: connection.id },
    data: {
      providerAccessToken: tokenPayload.access_token,
      providerTokenType: tokenPayload.token_type ?? "Bearer",
      providerTokenExpiresAt: typeof tokenPayload.expires_in === "number"
        ? new Date(Date.now() + (tokenPayload.expires_in * 1000))
        : null,
      providerUserId: mePayload?.id ?? null,
      providerConnectedAt: new Date(),
      businessAccountId: input.businessAccountId ?? connection.businessAccountId,
      phoneNumberId: input.phoneNumberId ?? connection.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber ?? connection.displayPhoneNumber,
      authFailureReason: null,
      errorState: null,
      authStateNonce: null,
      authRequestedAt: null,
    },
  });

  logOperationalEvent({
    domain: "whatsapp_connection",
    event: "meta_auth_completed",
    shopDomain: input.shopDomain,
    metadata: {
      hasAssetIds,
      providerUserId: mePayload?.id ?? null,
    },
  });

  return { ok: true, status: hasAssetIds ? "CONNECTED" : "INCOMPLETE", message };
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
