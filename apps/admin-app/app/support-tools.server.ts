import prisma from "./db.server";
import { dispatchDueCartRecoveries } from "./automations.cart-recovery.server";
import { dispatchDueBroadcastCampaigns } from "./campaigns.broadcast.server";

type WebhookEventStatus = "RECEIVED" | "ENQUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "DEAD_LETTER";
type QueueStatus = "PENDING" | "PROCESSING" | "FAILED" | "DEAD_LETTER" | "DONE";
type OutboundMessageStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "RETRY_SCHEDULED"
  | "DEAD_LETTER";

type WebhookEventRecord = {
  id: string;
  topic: string;
  processingStatus: WebhookEventStatus;
  failureReason: string | null;
  receivedAt: Date;
  updatedAt: Date;
  queueItem: {
    status: QueueStatus;
    attempts: number;
    lastError: string | null;
    updatedAt: Date;
  } | null;
};

type OutboundMessageRecord = {
  id: string;
  useCase: string;
  recipientAddress: string;
  status: OutboundMessageStatus;
  statusReason: string | null;
  retryCount: number;
  maxRetryCount: number;
  nextRetryAt: Date | null;
  providerName: string;
  callbackCorrelationId: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OrderConfirmationTraceRecord = {
  id: string;
  orderId: string;
  status: string;
  statusReason: string | null;
  webhookEventId: string;
  outboundMessageId: string | null;
  updatedAt: Date;
};

type OrderStatusTraceRecord = {
  id: string;
  orderId: string;
  statusType: string;
  state: string;
  stateReason: string | null;
  webhookEventId: string;
  outboundMessageId: string | null;
  updatedAt: Date;
};

type CartRecoveryTraceRecord = {
  id: string;
  checkoutId: string;
  state: string;
  stateReason: string | null;
  webhookEventId: string;
  outboundMessageId: string | null;
  updatedAt: Date;
};

type PrismaSupportDb = {
  webhookEvent: {
    findMany: (args: Record<string, unknown>) => Promise<WebhookEventRecord[]>;
  };
  outboundMessage: {
    findMany: (args: Record<string, unknown>) => Promise<OutboundMessageRecord[]>;
  };
  orderConfirmation: {
    findMany: (args: Record<string, unknown>) => Promise<OrderConfirmationTraceRecord[]>;
  };
  orderStatusUpdate: {
    findMany: (args: Record<string, unknown>) => Promise<OrderStatusTraceRecord[]>;
  };
  cartRecovery: {
    findMany: (args: Record<string, unknown>) => Promise<CartRecoveryTraceRecord[]>;
  };
};

const db = prisma as unknown as PrismaSupportDb;

export type SupportFailureItem = {
  id: string;
  area: "webhook" | "outbound";
  state: string;
  reason: string;
  occurredAt: Date;
  nextAction: string;
};

export type SupportTraceItem = {
  id: string;
  area: "order_confirmation" | "order_status_update" | "cart_recovery";
  entityReference: string;
  webhookEventId: string;
  actionState: string;
  outboundMessageId: string | null;
  updatedAt: Date;
};

function describeWebhookFailure(reason: string | null): string {
  if (!reason) {
    return "This event failed without a recorded reason. Review the event payload and worker logs.";
  }

  if (reason.includes("missing_order_id")) {
    return "Shopify payload did not include an order id. Confirm webhook topic and payload format.";
  }

  if (reason.includes("missing_checkout_id")) {
    return "Checkout id was missing. Verify checkout/update webhook payload shape and app scopes.";
  }

  if (reason.includes("template")) {
    return "A required template key is missing. Review automation settings and template mappings.";
  }

  return "Review payload details, then retry processing after correcting configuration or data.";
}

function describeOutboundFailure(message: OutboundMessageRecord): string {
  if (!message.statusReason) {
    return "Send failed without a provider reason. Check provider connectivity and credentials.";
  }

  if (message.statusReason.toLowerCase().includes("placeholder adapter")) {
    return "Provider adapter is in placeholder mode. Connect the WhatsApp provider before retrying.";
  }

  if (message.statusReason.toLowerCase().includes("rate")) {
    return "Provider rate limit was hit. Wait for retry window or reduce batch throughput.";
  }

  return "Validate recipient address, template key, and provider response details before retrying.";
}

export async function getSupportToolsSnapshot(shopDomain: string) {
  const [recentWebhooks, recentOutboundMessages, confirmations, statusUpdates, cartRecoveries] =
    await Promise.all([
      db.webhookEvent.findMany({
        where: { shopDomain },
        include: {
          queueItem: {
            select: {
              status: true,
              attempts: true,
              lastError: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { receivedAt: "desc" },
        take: 25,
      }),
      db.outboundMessage.findMany({
        where: { shopDomain },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      db.orderConfirmation.findMany({
        where: { shopDomain },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      db.orderStatusUpdate.findMany({
        where: { shopDomain },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      db.cartRecovery.findMany({
        where: { shopDomain },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

  const failures: SupportFailureItem[] = [
    ...recentWebhooks
      .filter((item) => item.processingStatus === "FAILED" || item.processingStatus === "DEAD_LETTER")
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        area: "webhook" as const,
        state: item.processingStatus,
        reason: item.failureReason ?? item.queueItem?.lastError ?? "No failure reason was persisted.",
        occurredAt: item.updatedAt,
        nextAction: describeWebhookFailure(item.failureReason ?? item.queueItem?.lastError ?? null),
      })),
    ...recentOutboundMessages
      .filter((item) => item.status === "FAILED" || item.status === "DEAD_LETTER")
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        area: "outbound" as const,
        state: item.status,
        reason: item.statusReason ?? "No provider reason was stored.",
        occurredAt: item.updatedAt,
        nextAction: describeOutboundFailure(item),
      })),
  ]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 12);

  const traces: SupportTraceItem[] = [
    ...confirmations.map((item) => ({
      id: item.id,
      area: "order_confirmation" as const,
      entityReference: `Order ${item.orderId}`,
      webhookEventId: item.webhookEventId,
      actionState: item.status,
      outboundMessageId: item.outboundMessageId,
      updatedAt: item.updatedAt,
    })),
    ...statusUpdates.map((item) => ({
      id: item.id,
      area: "order_status_update" as const,
      entityReference: `Order ${item.orderId} (${item.statusType})`,
      webhookEventId: item.webhookEventId,
      actionState: item.state,
      outboundMessageId: item.outboundMessageId,
      updatedAt: item.updatedAt,
    })),
    ...cartRecoveries.map((item) => ({
      id: item.id,
      area: "cart_recovery" as const,
      entityReference: `Checkout ${item.checkoutId}`,
      webhookEventId: item.webhookEventId,
      actionState: item.state,
      outboundMessageId: item.outboundMessageId,
      updatedAt: item.updatedAt,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 20);

  return {
    recentWebhooks,
    recentOutboundMessages,
    failures,
    traces,
  };
}

export async function runSupportRecoveryAction(input: {
  shopDomain: string;
  action: "dispatch-cart-recovery" | "dispatch-campaigns";
}) {
  if (input.action === "dispatch-cart-recovery") {
    const result = await dispatchDueCartRecoveries({
      shopDomain: input.shopDomain,
      limit: 25,
    });

    return {
      summary: `Triggered cart recovery dispatcher. Dispatched ${result.dispatched} of ${result.scanned} due recoveries.`,
    };
  }

  await dispatchDueBroadcastCampaigns({
    shopDomain: input.shopDomain,
    limitCampaigns: 3,
  });

  return {
    summary: "Triggered campaign dispatcher for due campaigns. Review latest logs and statuses below.",
  };
}
