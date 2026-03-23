import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";
import { logOperationalEvent } from "./observability.server";
import {
  PlaceholderWhatsAppProviderAdapter,
  createOutboundMessage,
  dispatchOutboundMessage,
} from "./messaging/outbound-messaging.server";

type OrderStatusUpdateState =
  | "PENDING"
  | "SKIPPED_DISABLED"
  | "SKIPPED_NOT_ELIGIBLE"
  | "SKIPPED_MISSING_TEMPLATE"
  | "DUPLICATE_SUPPRESSED"
  | "QUEUED"
  | "SENT"
  | "FAILED";

type OrderStatusType =
  | "ORDER_PARTIALLY_FULFILLED"
  | "ORDER_FULFILLED"
  | "ORDER_OUT_FOR_DELIVERY"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED";

type OrderStatusUpdateRecord = {
  id: string;
  shopDomain: string;
  orderId: string;
  statusType: OrderStatusType;
  state: OrderStatusUpdateState;
  stateReason: string | null;
  templateKey: string | null;
  recipientPhone: string | null;
  outboundMessageId: string | null;
  updatedAt: Date;
};

type ShopSettingsRecord = {
  orderStatusUpdatesEnabled: boolean;
  orderStatusTemplatePartialFulfilled: string | null;
  orderStatusTemplateFulfilled: string | null;
  orderStatusTemplateOutForDelivery: string | null;
  orderStatusTemplateDelivered: string | null;
  orderStatusTemplateCancelled: string | null;
};

type PrismaOrderStatusUpdateDb = {
  shopSettings: {
    upsert: (args: Record<string, unknown>) => Promise<ShopSettingsRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<ShopSettingsRecord | null>;
  };
  orderStatusUpdate: {
    create: (args: Record<string, unknown>) => Promise<OrderStatusUpdateRecord>;
    update: (args: Record<string, unknown>) => Promise<OrderStatusUpdateRecord>;
    findFirst: (args: Record<string, unknown>) => Promise<OrderStatusUpdateRecord | null>;
    findMany: (args: Record<string, unknown>) => Promise<OrderStatusUpdateRecord[]>;
  };
};

const db = prisma as unknown as PrismaOrderStatusUpdateDb;

export type OrderStatusUpdateSettings = {
  enabled: boolean;
  templateByStatus: Record<OrderStatusType, string>;
};

type NormalizedStatusUpdateEvent = {
  orderId: string | null;
  orderNumber: string | null;
  recipientPhone: string | null;
  statusType: OrderStatusType | null;
  sourceReference: string | null;
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

function normalizeId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return null;
}

function pickTemplateKey(settings: OrderStatusUpdateSettings, statusType: OrderStatusType): string {
  return settings.templateByStatus[statusType] ?? "";
}

function computeRecordDedupeKey(input: {
  shopDomain: string;
  orderId: string;
  statusType: OrderStatusType;
}): string {
  return `${input.shopDomain}:${input.orderId}:${input.statusType}`;
}

function resolveStatusTypeFromOrderUpdate(payload: Record<string, unknown>): OrderStatusType | null {
  const cancelledAt = normalizeOptionalString(String(payload.cancelled_at ?? ""));
  if (cancelledAt) {
    return "ORDER_CANCELLED";
  }

  const fulfillmentStatus = normalizeOptionalString(String(payload.fulfillment_status ?? ""));

  if (fulfillmentStatus === "fulfilled") {
    return "ORDER_FULFILLED";
  }

  if (fulfillmentStatus === "partial") {
    return "ORDER_PARTIALLY_FULFILLED";
  }

  return null;
}

function resolveStatusTypeFromFulfillment(payload: Record<string, unknown>): OrderStatusType | null {
  const shipmentStatus = normalizeOptionalString(String(payload.shipment_status ?? ""));

  if (shipmentStatus === "out_for_delivery") {
    return "ORDER_OUT_FOR_DELIVERY";
  }

  if (shipmentStatus === "delivered") {
    return "ORDER_DELIVERED";
  }

  return null;
}

function normalizeStatusEvent(topic: string, payload: unknown): NormalizedStatusUpdateEvent {
  if (!payload || typeof payload !== "object") {
    return {
      orderId: null,
      orderNumber: null,
      recipientPhone: null,
      statusType: null,
      sourceReference: null,
    };
  }

  const typedPayload = payload as Record<string, unknown>;
  const customerPayload =
    typedPayload.customer && typeof typedPayload.customer === "object"
      ? (typedPayload.customer as Record<string, unknown>)
      : null;

  if (topic === "orders/updated") {
    return {
      orderId: normalizeId(typedPayload.id),
      orderNumber: normalizeOptionalString(String(typedPayload.order_number ?? "")) ?? null,
      recipientPhone:
        normalizeOptionalString(String(typedPayload.phone ?? ""))
        ?? normalizeOptionalString(String(customerPayload?.phone ?? ""))
        ?? null,
      statusType: resolveStatusTypeFromOrderUpdate(typedPayload),
      sourceReference: normalizeOptionalString(String(typedPayload.updated_at ?? "")) ?? null,
    };
  }

  if (topic === "fulfillments/create" || topic === "fulfillments/update") {
    const shippingAddress =
      typedPayload.shipping_address && typeof typedPayload.shipping_address === "object"
        ? (typedPayload.shipping_address as Record<string, unknown>)
        : null;

    return {
      orderId: normalizeId(typedPayload.order_id),
      orderNumber: null,
      recipientPhone: normalizeOptionalString(String(shippingAddress?.phone ?? "")) ?? null,
      statusType: resolveStatusTypeFromFulfillment(typedPayload),
      sourceReference:
        normalizeId(typedPayload.id)
        ?? normalizeOptionalString(String(typedPayload.updated_at ?? ""))
        ?? null,
    };
  }

  return {
    orderId: null,
    orderNumber: null,
    recipientPhone: null,
    statusType: null,
    sourceReference: null,
  };
}

function buildStatusMessageText(statusType: OrderStatusType, orderNumber: string | null): string {
  const orderLabel = orderNumber ? ` #${orderNumber}` : "";

  if (statusType === "ORDER_PARTIALLY_FULFILLED") {
    return `Your order${orderLabel} has been partially fulfilled.`;
  }

  if (statusType === "ORDER_FULFILLED") {
    return `Your order${orderLabel} has been fulfilled.`;
  }

  if (statusType === "ORDER_OUT_FOR_DELIVERY") {
    return `Your order${orderLabel} is out for delivery.`;
  }

  if (statusType === "ORDER_DELIVERED") {
    return `Your order${orderLabel} has been delivered.`;
  }

  return `Your order${orderLabel} has been cancelled.`;
}

export function parseOrderStatusUpdateSettingsForm(formData: FormData): OrderStatusUpdateSettings {
  return {
    enabled: parseBooleanInput(formData.get("orderStatusUpdatesEnabled")),
    templateByStatus: {
      ORDER_PARTIALLY_FULFILLED:
        normalizeOptionalString(formData.get("orderStatusTemplatePartialFulfilled")) ?? "",
      ORDER_FULFILLED: normalizeOptionalString(formData.get("orderStatusTemplateFulfilled")) ?? "",
      ORDER_OUT_FOR_DELIVERY:
        normalizeOptionalString(formData.get("orderStatusTemplateOutForDelivery")) ?? "",
      ORDER_DELIVERED: normalizeOptionalString(formData.get("orderStatusTemplateDelivered")) ?? "",
      ORDER_CANCELLED: normalizeOptionalString(formData.get("orderStatusTemplateCancelled")) ?? "",
    },
  };
}

export async function getOrderStatusUpdateSettings(shopDomain: string): Promise<OrderStatusUpdateSettings> {
  const shop = await ensureShopFoundation(shopDomain);

  const settings = await db.shopSettings.findUnique({
    where: {
      shopId: shop.id,
    },
  });

  return {
    enabled: settings?.orderStatusUpdatesEnabled ?? false,
    templateByStatus: {
      ORDER_PARTIALLY_FULFILLED: settings?.orderStatusTemplatePartialFulfilled ?? "",
      ORDER_FULFILLED: settings?.orderStatusTemplateFulfilled ?? "",
      ORDER_OUT_FOR_DELIVERY: settings?.orderStatusTemplateOutForDelivery ?? "",
      ORDER_DELIVERED: settings?.orderStatusTemplateDelivered ?? "",
      ORDER_CANCELLED: settings?.orderStatusTemplateCancelled ?? "",
    },
  };
}

export async function updateOrderStatusUpdateSettings(
  shopDomain: string,
  input: OrderStatusUpdateSettings,
) {
  const shop = await ensureShopFoundation(shopDomain);

  return db.shopSettings.upsert({
    where: {
      shopId: shop.id,
    },
    update: {
      orderStatusUpdatesEnabled: input.enabled,
      orderStatusTemplatePartialFulfilled: input.templateByStatus.ORDER_PARTIALLY_FULFILLED || null,
      orderStatusTemplateFulfilled: input.templateByStatus.ORDER_FULFILLED || null,
      orderStatusTemplateOutForDelivery: input.templateByStatus.ORDER_OUT_FOR_DELIVERY || null,
      orderStatusTemplateDelivered: input.templateByStatus.ORDER_DELIVERED || null,
      orderStatusTemplateCancelled: input.templateByStatus.ORDER_CANCELLED || null,
    },
    create: {
      shopId: shop.id,
      orderStatusUpdatesEnabled: input.enabled,
      orderStatusTemplatePartialFulfilled: input.templateByStatus.ORDER_PARTIALLY_FULFILLED || null,
      orderStatusTemplateFulfilled: input.templateByStatus.ORDER_FULFILLED || null,
      orderStatusTemplateOutForDelivery: input.templateByStatus.ORDER_OUT_FOR_DELIVERY || null,
      orderStatusTemplateDelivered: input.templateByStatus.ORDER_DELIVERED || null,
      orderStatusTemplateCancelled: input.templateByStatus.ORDER_CANCELLED || null,
    },
  });
}

export async function processOrderStatusUpdate(input: {
  shopDomain: string;
  webhookEventId: string;
  topic: string;
  payload: unknown;
}) {
  await ensureShopFoundation(input.shopDomain);

  const settings = await getOrderStatusUpdateSettings(input.shopDomain);
  const event = normalizeStatusEvent(input.topic, input.payload);

  if (!event.orderId) {
    logOperationalEvent({
      domain: "order_status_update",
      event: "skipped_missing_order_id",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      reason: "missing_order_id",
      metadata: { topic: input.topic },
    });

    return { processed: false, reason: "missing_order_id", orderStatusUpdateId: null };
  }

  if (!event.statusType) {
    logOperationalEvent({
      domain: "order_status_update",
      event: "skipped_unmapped_status",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      reason: "status_not_mapped",
      metadata: { orderId: event.orderId, topic: input.topic },
    });

    return { processed: false, reason: "status_not_mapped", orderStatusUpdateId: null };
  }

  const dedupeKey = computeRecordDedupeKey({
    shopDomain: input.shopDomain,
    orderId: event.orderId,
    statusType: event.statusType,
  });

  let statusRecord: OrderStatusUpdateRecord;

  try {
    statusRecord = await db.orderStatusUpdate.create({
      data: {
        shopDomain: input.shopDomain,
        webhookEventId: input.webhookEventId,
        orderId: event.orderId,
        statusType: event.statusType,
        state: "PENDING" satisfies OrderStatusUpdateState,
        stateReason: null,
        dedupeKey,
        sourceTopic: input.topic,
        sourceReference: event.sourceReference,
        recipientPhone: event.recipientPhone,
        templateKey: null,
        normalizedPayload: JSON.stringify({ topic: input.topic, payload: input.payload, normalized: event }),
      },
    });
  } catch {
    const existing = await db.orderStatusUpdate.findFirst({
      where: {
        dedupeKey,
      },
    });

    if (!existing) {
      throw new Error(`failed_to_create_status_update_record:${dedupeKey}`);
    }

    if (existing.state !== "PENDING") {
      logOperationalEvent({
        domain: "order_status_update",
        event: "duplicate_suppressed",
        shopDomain: input.shopDomain,
        webhookEventId: input.webhookEventId,
        entityId: existing.id,
        metadata: {
          orderId: event.orderId,
          statusType: event.statusType,
        },
      });

      return { processed: true, reason: "duplicate_suppressed", orderStatusUpdateId: existing.id };
    }

    statusRecord = existing;
  }

  if (!settings.enabled) {
    const skipped = await db.orderStatusUpdate.update({
      where: { id: statusRecord.id },
      data: {
        state: "SKIPPED_DISABLED" satisfies OrderStatusUpdateState,
        stateReason: "order_status_updates_disabled",
        processedAt: new Date(),
      },
    });

    logOperationalEvent({
      domain: "order_status_update",
      event: "skipped_disabled",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      entityId: skipped.id,
      reason: "order_status_updates_disabled",
      metadata: {
        orderId: event.orderId,
        statusType: event.statusType,
      },
    });

    return { processed: true, reason: "order_status_updates_disabled", orderStatusUpdateId: skipped.id };
  }

  if (!event.recipientPhone) {
    const skipped = await db.orderStatusUpdate.update({
      where: { id: statusRecord.id },
      data: {
        state: "SKIPPED_NOT_ELIGIBLE" satisfies OrderStatusUpdateState,
        stateReason: "missing_recipient_phone",
        processedAt: new Date(),
      },
    });

    logOperationalEvent({
      domain: "order_status_update",
      event: "skipped_missing_recipient",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      entityId: skipped.id,
      reason: "missing_recipient_phone",
      metadata: {
        orderId: event.orderId,
        statusType: event.statusType,
      },
    });

    return { processed: true, reason: "missing_recipient_phone", orderStatusUpdateId: skipped.id };
  }

  const templateKey = pickTemplateKey(settings, event.statusType);

  if (!templateKey) {
    const skipped = await db.orderStatusUpdate.update({
      where: { id: statusRecord.id },
      data: {
        state: "SKIPPED_MISSING_TEMPLATE" satisfies OrderStatusUpdateState,
        stateReason: `missing_template_for_${event.statusType.toLowerCase()}`,
        processedAt: new Date(),
      },
    });

    logOperationalEvent({
      domain: "order_status_update",
      event: "skipped_missing_template",
      level: "warn",
      shopDomain: input.shopDomain,
      webhookEventId: input.webhookEventId,
      entityId: skipped.id,
      reason: skipped.stateReason,
      metadata: {
        orderId: event.orderId,
        statusType: event.statusType,
      },
    });

    return { processed: true, reason: "missing_template", orderStatusUpdateId: skipped.id };
  }

  const outboundMessage = await createOutboundMessage({
    shopDomain: input.shopDomain,
    channel: "WHATSAPP",
    useCase: "order_status_update",
    recipientAddress: event.recipientPhone,
    providerName: "whatsapp_placeholder",
    payload: {
      useCase: "order_status_update",
      orderId: event.orderId,
      statusType: event.statusType,
      text: buildStatusMessageText(event.statusType, event.orderNumber),
    },
    templateKey,
    metadata: {
      orderId: event.orderId,
      statusType: event.statusType,
      webhookEventId: input.webhookEventId,
    },
    idempotencyKey: `order-status-update:${dedupeKey}`,
  });

  await db.orderStatusUpdate.update({
    where: { id: statusRecord.id },
    data: {
      state: "QUEUED" satisfies OrderStatusUpdateState,
      stateReason: null,
      templateKey,
      recipientPhone: event.recipientPhone,
      outboundMessageId: outboundMessage.id,
    },
  });

  const dispatchResult = await dispatchOutboundMessage({
    messageId: outboundMessage.id,
    provider: new PlaceholderWhatsAppProviderAdapter(),
  });

  const isSent = dispatchResult.status === "SENT" || dispatchResult.status === "DELIVERED";

  const finalized = await db.orderStatusUpdate.update({
    where: { id: statusRecord.id },
    data: {
      state: isSent ? ("SENT" satisfies OrderStatusUpdateState) : ("FAILED" satisfies OrderStatusUpdateState),
      stateReason: isSent ? null : dispatchResult.statusReason ?? "dispatch_failed",
      processedAt: new Date(),
      failedAt: isSent ? null : new Date(),
    },
  });

  logOperationalEvent({
    domain: "order_status_update",
    event: "processed",
    level: finalized.state === "FAILED" ? "error" : "info",
    shopDomain: input.shopDomain,
    webhookEventId: input.webhookEventId,
    entityId: finalized.id,
    reason: finalized.stateReason,
    metadata: {
      orderId: event.orderId,
      statusType: event.statusType,
      state: finalized.state,
      outboundMessageId: outboundMessage.id,
    },
  });

  return {
    processed: true,
    reason: finalized.state,
    orderStatusUpdateId: finalized.id,
  };
}

export async function listRecentOrderStatusUpdates(shopDomain: string, limit = 30) {
  await ensureShopFoundation(shopDomain);

  return db.orderStatusUpdate.findMany({
    where: {
      shopDomain,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
}
