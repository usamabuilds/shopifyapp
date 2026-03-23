import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";
import { logOperationalEvent } from "./observability.server";
import {
  PlaceholderWhatsAppProviderAdapter,
  createOutboundMessage,
  dispatchOutboundMessage,
} from "./messaging/outbound-messaging.server";

type OrderConfirmationStatus =
  | "PENDING"
  | "SKIPPED_DISABLED"
  | "SKIPPED_NOT_ELIGIBLE"
  | "QUEUED"
  | "SENT"
  | "FAILED";

type OrderConfirmationRecord = {
  id: string;
  shopDomain: string;
  orderId: string;
  status: OrderConfirmationStatus;
  statusReason: string | null;
  templateKey: string | null;
  recipientPhone: string | null;
  outboundMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ShopSettingsRecord = {
  orderConfirmationEnabled: boolean;
  orderConfirmationTemplateKey: string | null;
};

type PrismaOrderConfirmationDb = {
  shopSettings: {
    upsert: (args: Record<string, unknown>) => Promise<ShopSettingsRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<ShopSettingsRecord | null>;
  };
  orderConfirmation: {
    create: (args: Record<string, unknown>) => Promise<OrderConfirmationRecord>;
    update: (args: Record<string, unknown>) => Promise<OrderConfirmationRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<OrderConfirmationRecord | null>;
    findMany: (args: Record<string, unknown>) => Promise<OrderConfirmationRecord[]>;
  };
};

const db = prisma as unknown as PrismaOrderConfirmationDb;

export type OrderConfirmationSettings = {
  enabled: boolean;
  templateKey: string;
};

type NormalizedOrderCreatedPayload = {
  orderId: string | null;
  orderNumber: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: string | null;
  totalPrice: string | null;
  recipientPhone: string | null;
  customerId: string | null;
};

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

export function parseOrderConfirmationSettingsForm(formData: FormData): OrderConfirmationSettings {
  return {
    enabled: parseBooleanInput(formData.get("orderConfirmationEnabled")),
    templateKey: normalizeOptionalString(formData.get("orderConfirmationTemplateKey")) ?? "",
  };
}

export async function getOrderConfirmationSettings(shopDomain: string): Promise<OrderConfirmationSettings> {
  const shop = await ensureShopFoundation(shopDomain);

  const settings = await db.shopSettings.findUnique({
    where: {
      shopId: shop.id,
    },
  });

  return {
    enabled: settings?.orderConfirmationEnabled ?? false,
    templateKey: settings?.orderConfirmationTemplateKey ?? "",
  };
}

export async function updateOrderConfirmationSettings(
  shopDomain: string,
  input: OrderConfirmationSettings,
) {
  const shop = await ensureShopFoundation(shopDomain);

  return db.shopSettings.upsert({
    where: {
      shopId: shop.id,
    },
    update: {
      orderConfirmationEnabled: input.enabled,
      orderConfirmationTemplateKey: input.templateKey || null,
    },
    create: {
      shopId: shop.id,
      orderConfirmationEnabled: input.enabled,
      orderConfirmationTemplateKey: input.templateKey || null,
    },
  });
}

function normalizeId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return null;
}

function normalizeOrderCreatedPayload(payload: unknown): NormalizedOrderCreatedPayload {
  if (!payload || typeof payload !== "object") {
    return {
      orderId: null,
      orderNumber: null,
      financialStatus: null,
      fulfillmentStatus: null,
      cancelledAt: null,
      totalPrice: null,
      recipientPhone: null,
      customerId: null,
    };
  }

  const typedPayload = payload as Record<string, unknown>;
  const customerPayload =
    typedPayload.customer && typeof typedPayload.customer === "object"
      ? (typedPayload.customer as Record<string, unknown>)
      : null;

  return {
    orderId: normalizeId(typedPayload.id),
    orderNumber: normalizeOptionalString(String(typedPayload.order_number ?? "")) ?? null,
    financialStatus:
      normalizeOptionalString(String(typedPayload.financial_status ?? "")) ?? null,
    fulfillmentStatus:
      normalizeOptionalString(String(typedPayload.fulfillment_status ?? "")) ?? null,
    cancelledAt: normalizeOptionalString(String(typedPayload.cancelled_at ?? "")) ?? null,
    totalPrice: normalizeOptionalString(String(typedPayload.total_price ?? "")) ?? null,
    recipientPhone:
      normalizeOptionalString(String(typedPayload.phone ?? ""))
      ?? normalizeOptionalString(String(customerPayload?.phone ?? ""))
      ?? null,
    customerId: normalizeId(customerPayload?.id),
  };
}

function evaluateOrderConfirmationEligibility(input: {
  order: NormalizedOrderCreatedPayload;
  settings: OrderConfirmationSettings;
}): { eligible: boolean; reason: string | null } {
  if (!input.settings.enabled) {
    return { eligible: false, reason: "order_confirmation_disabled" };
  }

  if (!input.order.orderId) {
    return { eligible: false, reason: "missing_order_id" };
  }

  if (!input.order.recipientPhone) {
    return { eligible: false, reason: "missing_recipient_phone" };
  }

  if (input.order.cancelledAt) {
    return { eligible: false, reason: "order_cancelled" };
  }

  const allowedFinancialStates = new Set(["paid", "partially_paid", "authorized"]);
  if (!input.order.financialStatus || !allowedFinancialStates.has(input.order.financialStatus)) {
    return { eligible: false, reason: "financial_status_not_eligible" };
  }

  return { eligible: true, reason: null };
}

function buildOrderConfirmationPayload(order: NormalizedOrderCreatedPayload) {
  return {
    useCase: "order_confirmation",
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    totalPrice: order.totalPrice,
    text: `Thanks for your order${order.orderNumber ? ` #${order.orderNumber}` : ""}.`,
  };
}

async function createInitialConfirmationRecord(input: {
  shopDomain: string;
  order: NormalizedOrderCreatedPayload;
  webhookEventId: string;
  templateKey: string | null;
}) {
  if (!input.order.orderId) {
    return null;
  }

  try {
    return await db.orderConfirmation.create({
      data: {
        shopDomain: input.shopDomain,
        orderId: input.order.orderId,
        webhookEventId: input.webhookEventId,
        status: "PENDING" satisfies OrderConfirmationStatus,
        statusReason: null,
        templateKey: input.templateKey,
        recipientPhone: input.order.recipientPhone,
        normalizedOrderPayload: JSON.stringify(input.order),
      },
    });
  } catch {
    return db.orderConfirmation.findUnique({
      where: {
        shopDomain_orderId: {
          shopDomain: input.shopDomain,
          orderId: input.order.orderId,
        },
      },
    });
  }
}

export async function processOrderCreatedConfirmation(input: {
  shopDomain: string;
  webhookEventId: string;
  payload: unknown;
}) {
  await ensureShopFoundation(input.shopDomain);

  const settings = await getOrderConfirmationSettings(input.shopDomain);
  const order = normalizeOrderCreatedPayload(input.payload);

  const confirmation = await createInitialConfirmationRecord({
    shopDomain: input.shopDomain,
    order,
    webhookEventId: input.webhookEventId,
    templateKey: settings.templateKey || null,
  });

  if (!order.orderId) {
    logOperationalEvent({
      domain: "order_confirmation",
      event: "skipped_missing_order_id",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      reason: "missing_order_id",
    });

    return {
      processed: false,
      reason: "missing_order_id",
      confirmationId: null,
    };
  }

  if (confirmation && confirmation.status !== "PENDING") {
    logOperationalEvent({
      domain: "order_confirmation",
      event: "duplicate_suppressed",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      entityId: confirmation.id,
      metadata: {
        orderId: order.orderId,
      },
    });

    return {
      processed: true,
      reason: "duplicate_suppressed",
      confirmationId: confirmation.id,
    };
  }

  const eligibility = evaluateOrderConfirmationEligibility({ order, settings });

  if (!eligibility.eligible) {
    const skippedStatus: OrderConfirmationStatus =
      eligibility.reason === "order_confirmation_disabled"
        ? "SKIPPED_DISABLED"
        : "SKIPPED_NOT_ELIGIBLE";

    const skipped = await db.orderConfirmation.update({
      where: { id: confirmation?.id },
      data: {
        status: skippedStatus,
        statusReason: eligibility.reason,
        processedAt: new Date(),
      },
    });

    logOperationalEvent({
      domain: "order_confirmation",
      event: "skipped_not_eligible",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      entityId: skipped.id,
      reason: eligibility.reason,
      metadata: {
        orderId: order.orderId,
      },
    });

    return {
      processed: true,
      reason: eligibility.reason,
      confirmationId: skipped.id,
    };
  }

  if (!settings.templateKey) {
    const skipped = await db.orderConfirmation.update({
      where: { id: confirmation?.id },
      data: {
        status: "SKIPPED_NOT_ELIGIBLE" satisfies OrderConfirmationStatus,
        statusReason: "missing_order_confirmation_template",
        processedAt: new Date(),
      },
    });

    logOperationalEvent({
      domain: "order_confirmation",
      event: "skipped_missing_template",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      entityId: skipped.id,
      reason: "missing_order_confirmation_template",
      metadata: {
        orderId: order.orderId,
      },
    });

    return {
      processed: true,
      reason: "missing_template",
      confirmationId: skipped.id,
    };
  }

  const idempotencyKey = `order-confirmation:${input.shopDomain}:${order.orderId}`;

  const outboundMessage = await createOutboundMessage({
    shopDomain: input.shopDomain,
    channel: "WHATSAPP",
    useCase: "order_confirmation",
    recipientAddress: order.recipientPhone!,
    providerName: "whatsapp_placeholder",
    payload: buildOrderConfirmationPayload(order),
    templateKey: settings.templateKey,
    metadata: {
      orderId: order.orderId,
      webhookEventId: input.webhookEventId,
    },
    idempotencyKey,
  });

  await db.orderConfirmation.update({
    where: { id: confirmation?.id },
    data: {
      status: "QUEUED" satisfies OrderConfirmationStatus,
      outboundMessageId: outboundMessage.id,
      statusReason: null,
    },
  });

  const dispatchResult = await dispatchOutboundMessage({
    messageId: outboundMessage.id,
    provider: new PlaceholderWhatsAppProviderAdapter(),
  });

  const isSent = dispatchResult.status === "SENT" || dispatchResult.status === "DELIVERED";

  const finalized = await db.orderConfirmation.update({
    where: { id: confirmation?.id },
    data: {
      status: isSent ? ("SENT" satisfies OrderConfirmationStatus) : ("FAILED" satisfies OrderConfirmationStatus),
      statusReason: isSent ? null : dispatchResult.statusReason ?? "dispatch_failed",
      processedAt: new Date(),
      failedAt: isSent ? null : new Date(),
    },
  });

  logOperationalEvent({
    domain: "order_confirmation",
    event: "processed",
    level: finalized.status === "FAILED" ? "error" : "info",
    shopDomain: input.shopDomain,
    webhookEventId: input.webhookEventId,
    entityId: finalized.id,
    reason: finalized.statusReason,
    metadata: {
      orderId: order.orderId,
      status: finalized.status,
      outboundMessageId: outboundMessage.id,
    },
  });

  return {
    processed: true,
    reason: finalized.status,
    confirmationId: finalized.id,
  };
}

export async function listRecentOrderConfirmations(shopDomain: string, limit = 20) {
  await ensureShopFoundation(shopDomain);

  return db.orderConfirmation.findMany({
    where: {
      shopDomain,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
}
