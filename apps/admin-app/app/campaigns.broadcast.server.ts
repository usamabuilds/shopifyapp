import { createHash } from "node:crypto";

import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";
import { logOperationalEvent } from "./observability.server";
import {
  PlaceholderWhatsAppProviderAdapter,
  createOutboundMessage,
  dispatchOutboundMessage,
} from "./messaging/outbound-messaging.server";

export type BroadcastAudienceType = "ALL_KNOWN_CONTACTS" | "RECENT_ORDER_CONTACTS" | "MANUAL_CONTACTS";
export type BroadcastCampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "QUEUED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type BroadcastRecipientState = "PENDING" | "SENT" | "FAILED" | "SKIPPED_DUPLICATE";

export type BroadcastCampaignSettings = {
  enabled: boolean;
  defaultTemplateKey: string;
  dispatchBatchSize: number;
  throttleMsBetweenMessages: number;
};

type CampaignSettingsRecord = {
  enabled: boolean;
  defaultTemplateKey: string | null;
  dispatchBatchSize: number;
  throttleMsBetweenMessages: number;
};

type CampaignRecord = {
  id: string;
  shopDomain: string;
  name: string;
  messageBody: string;
  templateKey: string | null;
  audienceType: BroadcastAudienceType;
  audienceQuery: string | null;
  status: BroadcastCampaignStatus;
  statusReason: string | null;
  scheduleAt: Date | null;
  totalRecipients: number;
  sentRecipients: number;
  failedRecipients: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
};

type CampaignRecipientRecord = {
  id: string;
  campaignId: string;
  recipientAddress: string;
  state: BroadcastRecipientState;
  stateReason: string | null;
  outboundMessageId: string | null;
  updatedAt: Date;
};

type CampaignDispatchLogRecord = {
  id: string;
  campaignId: string;
  level: "INFO" | "WARN" | "ERROR";
  eventType: string;
  message: string;
  metadata: string | null;
  createdAt: Date;
};

type ContactSourceRecord = {
  recipientPhone: string | null;
};

type PrismaCampaignDb = {
  campaignSettings: {
    findUnique: (args: Record<string, unknown>) => Promise<CampaignSettingsRecord | null>;
    upsert: (args: Record<string, unknown>) => Promise<CampaignSettingsRecord>;
  };
  broadcastCampaign: {
    create: (args: Record<string, unknown>) => Promise<CampaignRecord>;
    update: (args: Record<string, unknown>) => Promise<CampaignRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<CampaignRecord | null>;
    findMany: (args: Record<string, unknown>) => Promise<CampaignRecord[]>;
  };
  broadcastCampaignRecipient: {
    createMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
    update: (args: Record<string, unknown>) => Promise<CampaignRecipientRecord>;
    findMany: (args: Record<string, unknown>) => Promise<CampaignRecipientRecord[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  broadcastCampaignDispatchLog: {
    create: (args: Record<string, unknown>) => Promise<CampaignDispatchLogRecord>;
    findMany: (args: Record<string, unknown>) => Promise<CampaignDispatchLogRecord[]>;
  };
  orderConfirmation: {
    findMany: (args: Record<string, unknown>) => Promise<ContactSourceRecord[]>;
  };
  cartRecovery: {
    findMany: (args: Record<string, unknown>) => Promise<ContactSourceRecord[]>;
  };
  orderStatusUpdate: {
    findMany: (args: Record<string, unknown>) => Promise<ContactSourceRecord[]>;
  };
  outboundMessage: {
    findFirst: (args: Record<string, unknown>) => Promise<{ id: string } | null>;
  };
};

const db = prisma as unknown as PrismaCampaignDb;
const provider = new PlaceholderWhatsAppProviderAdapter();

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBooleanInput(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseIsoDateInput(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRecipientAddress(value: string): string | null {
  const normalized = value.trim();

  if (normalized.length < 6) {
    return null;
  }

  return normalized;
}

function buildAudienceQuery(input: { manualRecipients: string[] | null }): string | null {
  if (!input.manualRecipients) {
    return null;
  }

  return JSON.stringify({ manualRecipients: input.manualRecipients });
}

function parseAudienceQuery(audienceQuery: string | null): { manualRecipients: string[] } {
  if (!audienceQuery) {
    return { manualRecipients: [] };
  }

  try {
    const parsed = JSON.parse(audienceQuery) as { manualRecipients?: string[] };

    return {
      manualRecipients: Array.isArray(parsed.manualRecipients)
        ? parsed.manualRecipients.filter((item) => typeof item === "string")
        : [],
    };
  } catch {
    return { manualRecipients: [] };
  }
}

function dedupeRecipients(candidates: string[]): string[] {
  return [...new Set(candidates.map((item) => item.trim()).filter((item) => item.length > 0))];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseCampaignSettingsForm(formData: FormData): BroadcastCampaignSettings {
  return {
    enabled: parseBooleanInput(formData.get("campaignEnabled")),
    defaultTemplateKey: normalizeOptionalString(formData.get("campaignTemplateKey")) ?? "",
    dispatchBatchSize: parsePositiveInt(formData.get("campaignDispatchBatchSize"), 20, 1, 200),
    throttleMsBetweenMessages: parsePositiveInt(formData.get("campaignThrottleMs"), 0, 0, 60_000),
  };
}

export function parseCreateCampaignForm(formData: FormData) {
  const audienceTypeRaw = normalizeOptionalString(formData.get("audienceType")) ?? "ALL_KNOWN_CONTACTS";
  const manualRecipientsRaw = normalizeOptionalString(formData.get("manualRecipients")) ?? "";
  const manualRecipients = dedupeRecipients(
    manualRecipientsRaw
      .split(/[\n,]/)
      .map((item) => normalizeRecipientAddress(item) ?? "")
      .filter((item) => item.length > 0),
  );

  const audienceType: BroadcastAudienceType =
    audienceTypeRaw === "RECENT_ORDER_CONTACTS" || audienceTypeRaw === "MANUAL_CONTACTS"
      ? audienceTypeRaw
      : "ALL_KNOWN_CONTACTS";

  return {
    name: normalizeOptionalString(formData.get("name")) ?? "",
    messageBody: normalizeOptionalString(formData.get("messageBody")) ?? "",
    templateKey: normalizeOptionalString(formData.get("templateKey")),
    audienceType,
    scheduleAt: parseIsoDateInput(formData.get("scheduleAt")),
    manualRecipients,
  };
}

export async function getBroadcastCampaignSettings(shopDomain: string): Promise<BroadcastCampaignSettings> {
  const shop = await ensureShopFoundation(shopDomain);

  const settings = await db.campaignSettings.findUnique({ where: { shopId: shop.id } });

  return {
    enabled: settings?.enabled ?? false,
    defaultTemplateKey: settings?.defaultTemplateKey ?? "",
    dispatchBatchSize: settings?.dispatchBatchSize ?? 20,
    throttleMsBetweenMessages: settings?.throttleMsBetweenMessages ?? 0,
  };
}

export async function updateBroadcastCampaignSettings(
  shopDomain: string,
  input: BroadcastCampaignSettings,
): Promise<BroadcastCampaignSettings> {
  const shop = await ensureShopFoundation(shopDomain);

  const saved = await db.campaignSettings.upsert({
    where: { shopId: shop.id },
    update: {
      enabled: input.enabled,
      defaultTemplateKey: input.defaultTemplateKey || null,
      dispatchBatchSize: input.dispatchBatchSize,
      throttleMsBetweenMessages: input.throttleMsBetweenMessages,
    },
    create: {
      shopId: shop.id,
      enabled: input.enabled,
      defaultTemplateKey: input.defaultTemplateKey || null,
      dispatchBatchSize: input.dispatchBatchSize,
      throttleMsBetweenMessages: input.throttleMsBetweenMessages,
    },
  });

  return {
    enabled: saved.enabled,
    defaultTemplateKey: saved.defaultTemplateKey ?? "",
    dispatchBatchSize: saved.dispatchBatchSize,
    throttleMsBetweenMessages: saved.throttleMsBetweenMessages,
  };
}

async function writeCampaignLog(input: {
  campaignId: string;
  shopDomain: string;
  level: "INFO" | "WARN" | "ERROR";
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await db.broadcastCampaignDispatchLog.create({
    data: {
      campaignId: input.campaignId,
      shopDomain: input.shopDomain,
      level: input.level,
      eventType: input.eventType,
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

async function resolveAudienceRecipients(campaign: CampaignRecord): Promise<string[]> {
  if (campaign.audienceType === "MANUAL_CONTACTS") {
    const query = parseAudienceQuery(campaign.audienceQuery);
    return dedupeRecipients(query.manualRecipients);
  }

  if (campaign.audienceType === "RECENT_ORDER_CONTACTS") {
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db.orderConfirmation.findMany({
      where: {
        shopDomain: campaign.shopDomain,
        createdAt: { gte: threshold },
        recipientPhone: { not: null },
      },
      select: { recipientPhone: true },
      take: 5000,
    });

    return dedupeRecipients(rows.map((row) => row.recipientPhone ?? ""));
  }

  const [orderConfirmationRows, orderStatusRows, cartRows] = await Promise.all([
    db.orderConfirmation.findMany({
      where: { shopDomain: campaign.shopDomain, recipientPhone: { not: null } },
      select: { recipientPhone: true },
      take: 5000,
    }),
    db.orderStatusUpdate.findMany({
      where: { shopDomain: campaign.shopDomain, recipientPhone: { not: null } },
      select: { recipientPhone: true },
      take: 5000,
    }),
    db.cartRecovery.findMany({
      where: { shopDomain: campaign.shopDomain, recipientPhone: { not: null } },
      select: { recipientPhone: true },
      take: 5000,
    }),
  ]);

  return dedupeRecipients([
    ...orderConfirmationRows.map((row) => row.recipientPhone ?? ""),
    ...orderStatusRows.map((row) => row.recipientPhone ?? ""),
    ...cartRows.map((row) => row.recipientPhone ?? ""),
  ]);
}

async function materializeCampaignAudience(campaign: CampaignRecord): Promise<number> {
  const recipients = await resolveAudienceRecipients(campaign);

  if (recipients.length === 0) {
    await db.broadcastCampaign.update({
      where: { id: campaign.id },
      data: {
        status: "FAILED" satisfies BroadcastCampaignStatus,
        statusReason: "No recipients found for selected audience.",
        failedAt: new Date(),
      },
    });

    await writeCampaignLog({
      campaignId: campaign.id,
      shopDomain: campaign.shopDomain,
      level: "WARN",
      eventType: "campaign.audience.empty",
      message: "Audience selection returned zero recipients.",
    });

    return 0;
  }

  const recipientRows = recipients.map((recipientAddress) => ({
    campaignId: campaign.id,
    shopDomain: campaign.shopDomain,
    recipientAddress,
    dedupeKey: createHash("sha256").update(`${campaign.id}:${recipientAddress}`).digest("hex"),
    state: "PENDING" satisfies BroadcastRecipientState,
  }));

  const existing = await db.broadcastCampaignRecipient.findMany({
    where: { campaignId: campaign.id },
    select: { recipientAddress: true },
  });

  const existingAddresses = new Set(existing.map((item) => item.recipientAddress));
  const toInsert = recipientRows.filter((row) => !existingAddresses.has(row.recipientAddress));

  const created = toInsert.length > 0
    ? await db.broadcastCampaignRecipient.createMany({ data: toInsert })
    : { count: 0 };

  await db.broadcastCampaign.update({
    where: { id: campaign.id },
    data: {
      totalRecipients: recipients.length,
      statusReason: null,
    },
  });

  await writeCampaignLog({
    campaignId: campaign.id,
    shopDomain: campaign.shopDomain,
    level: "INFO",
    eventType: "campaign.audience.materialized",
    message: "Campaign audience was materialized.",
    metadata: {
      requestedRecipients: recipients.length,
      insertedRecipients: created.count,
      duplicateSuppressed: Math.max(0, recipients.length - created.count),
    },
  });

  return recipients.length;
}

export async function createBroadcastCampaign(args: {
  shopDomain: string;
  input: ReturnType<typeof parseCreateCampaignForm>;
  mode: "draft" | "schedule" | "send-now";
}) {
  await ensureShopFoundation(args.shopDomain);

  const now = new Date();
  const scheduleAt = args.mode === "schedule" ? args.input.scheduleAt : null;

  const status: BroadcastCampaignStatus =
    args.mode === "draft"
      ? "DRAFT"
      : args.mode === "schedule" && scheduleAt && scheduleAt.getTime() > now.getTime()
        ? "SCHEDULED"
        : "QUEUED";

  const campaign = await db.broadcastCampaign.create({
    data: {
      shopDomain: args.shopDomain,
      name: args.input.name,
      messageBody: args.input.messageBody,
      templateKey: args.input.templateKey,
      audienceType: args.input.audienceType,
      audienceQuery: buildAudienceQuery({
        manualRecipients:
          args.input.audienceType === "MANUAL_CONTACTS" ? args.input.manualRecipients : null,
      }),
      status,
      scheduleAt,
      sendNowRequestedAt: args.mode === "send-now" ? now : null,
    },
  });

  await writeCampaignLog({
    campaignId: campaign.id,
    shopDomain: campaign.shopDomain,
    level: "INFO",
    eventType: "campaign.created",
    message: `Campaign created in status ${campaign.status}.`,
    metadata: {
      mode: args.mode,
      audienceType: campaign.audienceType,
      scheduleAt: campaign.scheduleAt?.toISOString() ?? null,
    },
  });

  if (status !== "DRAFT") {
    await materializeCampaignAudience(campaign);
  }

  return campaign;
}

export async function queueBroadcastCampaign(args: {
  campaignId: string;
  shopDomain: string;
  mode: "schedule" | "send-now";
  scheduleAt?: Date | null;
}) {
  const campaign = await db.broadcastCampaign.findUnique({ where: { id: args.campaignId } });

  if (!campaign || campaign.shopDomain !== args.shopDomain) {
    throw new Error("[campaign] campaign not found");
  }

  let recipientCount = await db.broadcastCampaignRecipient.count({
    where: { campaignId: campaign.id },
  });

  if (recipientCount === 0) {
    recipientCount = await materializeCampaignAudience(campaign);
  }

  if (recipientCount === 0) {
    return campaign;
  }

  const scheduleAt = args.mode === "schedule" ? args.scheduleAt ?? campaign.scheduleAt : null;
  const now = new Date();
  const status: BroadcastCampaignStatus =
    args.mode === "schedule" && scheduleAt && scheduleAt.getTime() > now.getTime() ? "SCHEDULED" : "QUEUED";

  const queued = await db.broadcastCampaign.update({
    where: { id: campaign.id },
    data: {
      status,
      scheduleAt: args.mode === "schedule" ? scheduleAt : null,
      sendNowRequestedAt: args.mode === "send-now" ? now : null,
      statusReason: null,
    },
  });

  await writeCampaignLog({
    campaignId: campaign.id,
    shopDomain: campaign.shopDomain,
    level: "INFO",
    eventType: "campaign.queued",
    message: `Campaign queued in status ${status}.`,
  });

  return queued;
}

async function updateCampaignRollup(campaignId: string): Promise<CampaignRecord> {
  const [sent, failed, pending] = await Promise.all([
    db.broadcastCampaignRecipient.count({ where: { campaignId, state: "SENT" } }),
    db.broadcastCampaignRecipient.count({ where: { campaignId, state: "FAILED" } }),
    db.broadcastCampaignRecipient.count({ where: { campaignId, state: "PENDING" } }),
  ]);

  const status: BroadcastCampaignStatus =
    pending > 0 ? "IN_PROGRESS" : failed > 0 ? "FAILED" : "COMPLETED";

  return db.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      status,
      sentRecipients: sent,
      failedRecipients: failed,
      completedAt: pending === 0 ? new Date() : null,
      failedAt: pending === 0 && failed > 0 ? new Date() : null,
      lastDispatchAt: new Date(),
    },
  });
}

async function dispatchRecipient(campaign: CampaignRecord, recipient: CampaignRecipientRecord) {
  const idempotencyKey = `campaign:${campaign.id}:${recipient.recipientAddress}`;

  const existingOutbound = await db.outboundMessage.findFirst({
    where: {
      shopDomain: campaign.shopDomain,
      idempotencyKey,
    },
    select: { id: true },
  });

  const outboundMessageId = existingOutbound
    ? existingOutbound.id
    : (
      await createOutboundMessage({
        shopDomain: campaign.shopDomain,
        channel: "WHATSAPP",
        useCase: "broadcast",
        recipientAddress: recipient.recipientAddress,
        payload: {
          useCase: "broadcast",
          campaignId: campaign.id,
          campaignName: campaign.name,
          text: campaign.messageBody,
        },
        templateKey: campaign.templateKey,
        metadata: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          audienceType: campaign.audienceType,
        },
        providerName: provider.providerName,
        idempotencyKey,
      })
    ).id;

  const outbound = await dispatchOutboundMessage({
    messageId: outboundMessageId,
    provider,
  });

  const nextState: BroadcastRecipientState = outbound.status === "SENT" ? "SENT" : "FAILED";

  await db.broadcastCampaignRecipient.update({
    where: { id: recipient.id },
    data: {
      state: nextState,
      stateReason: outbound.statusReason,
      outboundMessageId,
      dispatchAttemptCount: { increment: 1 },
      lastDispatchedAt: new Date(),
      sentAt: nextState === "SENT" ? new Date() : null,
      failedAt: nextState === "FAILED" ? new Date() : null,
    },
  });

  await writeCampaignLog({
    campaignId: campaign.id,
    shopDomain: campaign.shopDomain,
    level: nextState === "SENT" ? "INFO" : "ERROR",
    eventType: nextState === "SENT" ? "campaign.recipient.sent" : "campaign.recipient.failed",
    message:
      nextState === "SENT"
        ? `Recipient ${recipient.recipientAddress} dispatched.`
        : `Dispatch failed for ${recipient.recipientAddress}.`,
    metadata: {
      outboundMessageId,
      outboundStatus: outbound.status,
      statusReason: outbound.statusReason,
    },
  });
}

export async function dispatchDueBroadcastCampaigns(args: {
  shopDomain: string;
  limitCampaigns?: number;
}) {
  const settings = await getBroadcastCampaignSettings(args.shopDomain);

  if (!settings.enabled) {
    logOperationalEvent({
      domain: "campaign",
      event: "dispatch_skipped_disabled",
      level: "warn",
      shopDomain: args.shopDomain,
    });
    return;
  }

  const now = new Date();
  const campaigns = await db.broadcastCampaign.findMany({
    where: {
      shopDomain: args.shopDomain,
      OR: [
        { status: "QUEUED" },
        { status: "IN_PROGRESS" },
        { status: "SCHEDULED", scheduleAt: { lte: now } },
      ],
    },
    orderBy: [{ scheduleAt: "asc" }, { createdAt: "asc" }],
    take: args.limitCampaigns ?? 5,
  });

  logOperationalEvent({
    domain: "campaign",
    event: "dispatch_batch_loaded",
    shopDomain: args.shopDomain,
    metadata: {
      campaignCount: campaigns.length,
      limitCampaigns: args.limitCampaigns ?? 5,
      batchSize: settings.dispatchBatchSize,
    },
  });

  for (const campaign of campaigns) {
    await db.broadcastCampaign.update({
      where: { id: campaign.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: campaign.startedAt ?? new Date(),
      },
    });

    const recipients = await db.broadcastCampaignRecipient.findMany({
      where: {
        campaignId: campaign.id,
        state: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      take: settings.dispatchBatchSize,
    });

    if (recipients.length === 0) {
      await updateCampaignRollup(campaign.id);
      continue;
    }

    for (const recipient of recipients) {
      try {
        await dispatchRecipient(campaign, recipient);
      } catch (error) {
        await db.broadcastCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            state: "FAILED",
            stateReason: error instanceof Error ? error.message : "Unknown dispatch error.",
            failedAt: new Date(),
          },
        });

        await writeCampaignLog({
          campaignId: campaign.id,
          shopDomain: campaign.shopDomain,
          level: "ERROR",
          eventType: "campaign.dispatch.exception",
          message: `Unhandled dispatch error for ${recipient.recipientAddress}.`,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        logOperationalEvent({
          domain: "campaign",
          event: "recipient_dispatch_exception",
          level: "error",
          shopDomain: campaign.shopDomain,
          entityId: campaign.id,
          reason: error instanceof Error ? error.message : String(error),
          metadata: {
            recipientAddress: recipient.recipientAddress,
          },
        });
      }

      if (settings.throttleMsBetweenMessages > 0) {
        await sleep(settings.throttleMsBetweenMessages);
      }
    }

    await updateCampaignRollup(campaign.id);
  }
}

export async function listBroadcastCampaigns(shopDomain: string) {
  await ensureShopFoundation(shopDomain);

  return db.broadcastCampaign.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}

export async function listBroadcastCampaignLogs(shopDomain: string) {
  await ensureShopFoundation(shopDomain);

  return db.broadcastCampaignDispatchLog.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
