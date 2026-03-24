import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";

export type SyncedTemplateStatus = "APPROVED" | "PAUSED" | "REJECTED" | "UNAVAILABLE" | "DRAFT";
export type SyncedTemplateCategory = "UTILITY" | "MARKETING";

export type SyncedWhatsappTemplate = {
  key: string;
  providerTemplateId: string;
  name: string;
  category: SyncedTemplateCategory;
  language: string;
  status: SyncedTemplateStatus;
  updatedAt: string;
  content: {
    header: string;
    body: string;
    footer?: string;
  };
};

export type TemplateSyncVisualState = "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "SYNC_FAILED" | "STALE";

type ConnectionRecord = {
  id: string;
  businessAccountId: string | null;
  phoneNumberId: string | null;
  syncStatus: string;
  templateSyncRequested: boolean;
  lastSyncedAt: Date | null;
};

type TemplateRecord = {
  id: string;
  templateKey: string;
  providerTemplateId: string | null;
  name: string;
  category: string;
  language: string;
  status: string;
  header: string;
  body: string;
  footer: string | null;
  updatedAt: Date;
};

type PrismaDb = {
  shopWhatsappConnection: {
    findUnique: (args: Record<string, unknown>) => Promise<ConnectionRecord | null>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
  shopWhatsappTemplate: {
    findMany: (args: Record<string, unknown>) => Promise<TemplateRecord[]>;
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaDb;

const SYNC_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function parseTemplateStatus(value: string | null | undefined): SyncedTemplateStatus {
  if (value === "APPROVED" || value === "PAUSED" || value === "REJECTED" || value === "UNAVAILABLE" || value === "DRAFT") {
    return value;
  }

  return "DRAFT";
}

function parseTemplateCategory(value: string | null | undefined): SyncedTemplateCategory {
  return value === "MARKETING" ? "MARKETING" : "UTILITY";
}

function parseProviderSyncStatus(value: string | null | undefined): "NOT_STARTED" | "PENDING" | "IN_SYNC" | "FAILED" | "NEEDS_ATTENTION" {
  if (value === "PENDING" || value === "IN_SYNC" || value === "FAILED" || value === "NEEDS_ATTENTION") {
    return value;
  }

  return "NOT_STARTED";
}

function buildProviderTemplates(connection: { businessAccountId: string; phoneNumberId: string }): SyncedWhatsappTemplate[] {
  const now = Date.now();
  const suffix = connection.phoneNumberId.slice(-4);

  return [
    {
      key: "order_confirmation_v1",
      providerTemplateId: `wa_${connection.businessAccountId}_order_confirmation_v1`,
      name: "Order confirmation (default)",
      category: "UTILITY",
      language: "en_US",
      status: "APPROVED",
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "Order #{{order_number}} confirmed",
        body: "Hi {{customer_first_name}}, thanks for your order #{{order_number}}. Total: {{total_price}} {{currency}}.",
        footer: `Phone ${suffix}`,
      },
    },
    {
      key: "order_status_delivery_v2",
      providerTemplateId: `wa_${connection.businessAccountId}_order_status_delivery_v2`,
      name: "Order status update",
      category: "UTILITY",
      language: "en_US",
      status: "APPROVED",
      updatedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "Order #{{order_number}} status",
        body: "Update: your order #{{order_number}} is {{status_label}}. Tracking: {{tracking_url}}",
      },
    },
    {
      key: "cart_recovery_nudge_v1",
      providerTemplateId: `wa_${connection.businessAccountId}_cart_recovery_nudge_v1`,
      name: "Cart recovery nudge",
      category: "MARKETING",
      language: "en_US",
      status: "PAUSED",
      updatedAt: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "You left something behind",
        body: "Hi {{customer_first_name}}, your cart worth {{cart_subtotal}} {{currency}} is waiting: {{checkout_url}}",
      },
    },
    {
      key: "broadcast_flash_sale_v3",
      providerTemplateId: `wa_${connection.businessAccountId}_broadcast_flash_sale_v3`,
      name: "Flash sale broadcast",
      category: "MARKETING",
      language: "en_US",
      status: "REJECTED",
      updatedAt: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "{{campaign_name}}",
        body: "{{message_body}} Shop now: {{campaign_url}}",
      },
    },
  ];
}

export async function listSyncedWhatsappTemplates(shopDomain: string): Promise<SyncedWhatsappTemplate[]> {
  const shop = await ensureShopFoundation(shopDomain);
  const templates = await db.shopWhatsappTemplate.findMany({
    where: { shopId: shop.id },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return templates.map((template) => ({
    key: template.templateKey,
    providerTemplateId: template.providerTemplateId ?? template.templateKey,
    name: template.name,
    category: parseTemplateCategory(template.category),
    language: template.language,
    status: parseTemplateStatus(template.status),
    updatedAt: template.updatedAt.toISOString(),
    content: {
      header: template.header,
      body: template.body,
      footer: template.footer ?? undefined,
    },
  }));
}

export function resolveTemplateSyncVisualState(args: {
  syncStatus: string;
  lastSyncedAt: string | null;
}): TemplateSyncVisualState {
  const syncStatus = parseProviderSyncStatus(args.syncStatus);

  if (!args.lastSyncedAt) {
    if (syncStatus === "PENDING") {
      return "SYNCING";
    }

    if (syncStatus === "FAILED" || syncStatus === "NEEDS_ATTENTION") {
      return "SYNC_FAILED";
    }

    return "NEVER_SYNCED";
  }

  if (syncStatus === "PENDING") {
    return "SYNCING";
  }

  if (syncStatus === "FAILED" || syncStatus === "NEEDS_ATTENTION") {
    return "SYNC_FAILED";
  }

  const syncAgeMs = Date.now() - new Date(args.lastSyncedAt).getTime();

  if (syncAgeMs > SYNC_STALE_AFTER_MS) {
    return "STALE";
  }

  return "SYNCED";
}

export async function requestWhatsappTemplateSync(shopDomain: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const shop = await ensureShopFoundation(shopDomain);
  const connection = await db.shopWhatsappConnection.findUnique({ where: { shopId: shop.id } });

  if (!connection) {
    return { ok: false, reason: "Connect WhatsApp before syncing templates." };
  }

  if (!connection.businessAccountId || !connection.phoneNumberId) {
    await db.shopWhatsappConnection.update({
      where: { id: connection.id },
      data: {
        syncStatus: "FAILED",
        templateSyncRequested: true,
        errorState: "Missing business account ID or phone number ID.",
      },
    });

    return { ok: false, reason: "Missing connection identifiers. Add business account and phone number IDs." };
  }

  await db.shopWhatsappConnection.update({
    where: { id: connection.id },
    data: {
      syncStatus: "PENDING",
      templateSyncRequested: true,
    },
  });

  const providerTemplates = buildProviderTemplates({
    businessAccountId: connection.businessAccountId,
    phoneNumberId: connection.phoneNumberId,
  });

  const syncedKeys = new Set(providerTemplates.map((item) => item.key));

  for (const template of providerTemplates) {
    await db.shopWhatsappTemplate.upsert({
      where: {
        shopId_templateKey: {
          shopId: shop.id,
          templateKey: template.key,
        },
      },
      update: {
        providerTemplateId: template.providerTemplateId,
        name: template.name,
        category: template.category,
        language: template.language,
        status: template.status,
        header: template.content.header,
        body: template.content.body,
        footer: template.content.footer ?? null,
        syncedAt: new Date(),
      },
      create: {
        shopId: shop.id,
        templateKey: template.key,
        providerTemplateId: template.providerTemplateId,
        name: template.name,
        category: template.category,
        language: template.language,
        status: template.status,
        header: template.content.header,
        body: template.content.body,
        footer: template.content.footer ?? null,
        syncedAt: new Date(),
      },
    });
  }

  await db.shopWhatsappTemplate.updateMany({
    where: {
      shopId: shop.id,
      templateKey: {
        notIn: [...syncedKeys],
      },
    },
    data: {
      status: "UNAVAILABLE",
      syncedAt: new Date(),
    },
  });

  await db.shopWhatsappConnection.update({
    where: { id: connection.id },
    data: {
      syncStatus: "IN_SYNC",
      templateSyncRequested: false,
      lastSyncedAt: new Date(),
      errorState: null,
      connectionStatus: "CONNECTED",
    },
  });

  return { ok: true };
}
