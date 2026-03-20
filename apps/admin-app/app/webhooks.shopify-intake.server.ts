import { createHash } from "node:crypto";

import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";

type WebhookProcessingStatus =
  | "RECEIVED"
  | "ENQUEUED"
  | "PROCESSED"
  | "FAILED"
  | "DEAD_LETTER";
type QueueStatus = "PENDING" | "PROCESSING" | "FAILED" | "DEAD_LETTER" | "DONE";

type WebhookEventRecord = {
  id: string;
  dedupeKey: string;
  processingStatus: WebhookProcessingStatus;
};

type WebhookQueueRecord = {
  id: string;
};

type ShopifyNormalizedEvent = {
  source: "shopify";
  topic: string;
  shopDomain: string;
  externalEventId: string | null;
  receivedAt: string;
  payload: unknown;
  resource: {
    orderId: string | null;
    checkoutId: string | null;
    customerId: string | null;
  };
};

type PrismaWebhookDb = {
  webhookEvent: {
    upsert: (args: Record<string, unknown>) => Promise<WebhookEventRecord>;
    update: (args: Record<string, unknown>) => Promise<WebhookEventRecord>;
  };
  webhookQueueItem: {
    upsert: (args: Record<string, unknown>) => Promise<WebhookQueueRecord>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

const db = prisma as unknown as PrismaWebhookDb;

function normalizeResourceId(resourceValue: unknown): string | null {
  if (typeof resourceValue === "string" && resourceValue.length > 0) {
    return resourceValue;
  }

  if (typeof resourceValue === "number") {
    return resourceValue.toString();
  }

  return null;
}

function getPayloadResource(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      orderId: null,
      checkoutId: null,
      customerId: null,
    };
  }

  const typedPayload = payload as Record<string, unknown>;
  const customerPayload = typedPayload.customer;
  const customerId =
    customerPayload && typeof customerPayload === "object"
      ? normalizeResourceId((customerPayload as Record<string, unknown>).id)
      : normalizeResourceId(typedPayload.customer_id);

  return {
    orderId: normalizeResourceId(typedPayload.id),
    checkoutId: normalizeResourceId(typedPayload.checkout_id),
    customerId,
  };
}

function computeFallbackDedupeKey(shopDomain: string, topic: string, payload: unknown) {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return `shopify:${shopDomain}:${topic}:${payloadHash}`;
}

export async function processShopifyWebhookIntake(input: {
  request: Request;
  shop: string;
  topic: string;
  payload: unknown;
}) {
  const { request, shop, topic, payload } = input;

  await ensureShopFoundation(shop);

  const webhookId = request.headers.get("x-shopify-webhook-id");
  const dedupeKey = webhookId
    ? `shopify:${shop}:${topic}:${webhookId}`
    : computeFallbackDedupeKey(shop, topic, payload);

  const receivedAt = new Date();
  const normalizedEvent: ShopifyNormalizedEvent = {
    source: "shopify",
    topic,
    shopDomain: shop,
    externalEventId: webhookId,
    receivedAt: receivedAt.toISOString(),
    payload,
    resource: getPayloadResource(payload),
  };

  const rawHeaders = {
    webhookId,
    topic: request.headers.get("x-shopify-topic"),
    shopDomain: request.headers.get("x-shopify-shop-domain"),
    triggeredAt: request.headers.get("x-shopify-triggered-at"),
    hmacPresent: Boolean(request.headers.get("x-shopify-hmac-sha256")),
  };

  const webhookEvent = await db.webhookEvent.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      source: "SHOPIFY",
      topic,
      shopDomain: shop,
      externalEventId: webhookId,
      dedupeKey,
      rawPayload: JSON.stringify(payload),
      headersPayload: JSON.stringify(rawHeaders),
      normalizationVersion: 1,
      normalizedPayload: JSON.stringify(normalizedEvent),
      processingStatus: "RECEIVED",
      receivedAt,
    },
  });

  const isDuplicate = webhookEvent.processingStatus !== "RECEIVED";

  if (isDuplicate) {
    console.info(
      `[webhook-intake] Duplicate webhook received and skipped. topic=${topic} shop=${shop} dedupeKey=${dedupeKey}`,
    );

    return {
      isDuplicate: true,
      dedupeKey,
      webhookEventId: webhookEvent.id,
    };
  }

  await db.webhookQueueItem.upsert({
    where: {
      webhookEventId: webhookEvent.id,
    },
    update: {},
    create: {
      webhookEventId: webhookEvent.id,
      queueName: "webhook-events",
      status: "PENDING" satisfies QueueStatus,
      availableAt: receivedAt,
    },
  });

  await db.webhookEvent.update({
    where: {
      id: webhookEvent.id,
    },
    data: {
      processingStatus: "ENQUEUED",
      enqueuedAt: new Date(),
    },
  });

  console.info(
    `[webhook-intake] Webhook accepted. topic=${topic} shop=${shop} eventId=${webhookEvent.id}`,
  );

  return {
    isDuplicate: false,
    dedupeKey,
    webhookEventId: webhookEvent.id,
  };
}

export async function markWebhookIntakeProcessed(args: { webhookEventId: string }) {
  const { webhookEventId } = args;

  await db.webhookQueueItem.updateMany({
    where: {
      webhookEventId,
      status: {
        in: ["PENDING", "PROCESSING", "FAILED"],
      },
    },
    data: {
      status: "DONE" satisfies QueueStatus,
      lockedAt: null,
      lastError: null,
    },
  });

  await db.webhookEvent.update({
    where: {
      id: webhookEventId,
    },
    data: {
      processingStatus: "PROCESSED",
      processedAt: new Date(),
      failureReason: null,
    },
  });
}

export async function markWebhookIntakeFailure(args: {
  webhookEventId: string;
  reason: string;
}) {
  const { webhookEventId, reason } = args;

  await db.webhookQueueItem.updateMany({
    where: {
      webhookEventId,
    },
    data: {
      status: "FAILED" satisfies QueueStatus,
      lastError: reason,
      lockedAt: null,
      attempts: {
        increment: 1,
      },
    },
  });

  await db.webhookEvent.update({
    where: {
      id: webhookEventId,
    },
    data: {
      processingStatus: "FAILED",
      failedAt: new Date(),
      failureReason: reason,
      failureCount: {
        increment: 1,
      },
    },
  });
}
