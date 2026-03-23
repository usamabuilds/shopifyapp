import { createHash } from "node:crypto";

import prisma from "../db.server";
import { ensureShopFoundation } from "../models.shop.server";
import { logOperationalEvent } from "../observability.server";

export type MessageChannel = "WHATSAPP";
export type OutboundMessageStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "RETRY_SCHEDULED"
  | "DEAD_LETTER";
export type AttemptStatus = "INITIATED" | "SUCCEEDED" | "FAILED";
export type RetryClass =
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "NON_RETRYABLE";
export type CallbackEventStatus = "RECEIVED" | "RECONCILED" | "FAILED";

export type OutboundUseCase =
  | "order_confirmation"
  | "order_status_update"
  | "cart_recovery"
  | "broadcast"
  | "custom";

export type OutboundMessageRecord = {
  id: string;
  shopDomain: string;
  providerName: string;
  providerMessageId: string | null;
  callbackCorrelationId: string | null;
  status: OutboundMessageStatus;
  statusReason: string | null;
  retryCount: number;
  maxRetryCount: number;
  recipientAddress: string;
  payload: string;
};

type OutboundAttemptRecord = {
  id: string;
  attemptNumber: number;
  status: AttemptStatus;
  retryClass: RetryClass;
};

type OutboundCallbackRecord = {
  id: string;
  shopDomain: string;
  status: CallbackEventStatus;
  callbackCorrelationId: string | null;
  providerMessageId: string | null;
};

type PrismaOutboundDb = {
  outboundMessage: {
    create: (args: Record<string, unknown>) => Promise<OutboundMessageRecord>;
    update: (args: Record<string, unknown>) => Promise<OutboundMessageRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<OutboundMessageRecord | null>;
    findFirst: (args: Record<string, unknown>) => Promise<OutboundMessageRecord | null>;
  };
  outboundMessageAttempt: {
    create: (args: Record<string, unknown>) => Promise<OutboundAttemptRecord>;
    update: (args: Record<string, unknown>) => Promise<OutboundAttemptRecord>;
  };
  outboundMessageCallback: {
    upsert: (args: Record<string, unknown>) => Promise<OutboundCallbackRecord>;
    update: (args: Record<string, unknown>) => Promise<OutboundCallbackRecord>;
  };
};

const db = prisma as unknown as PrismaOutboundDb;

export type CreateOutboundMessageInput = {
  shopDomain: string;
  channel: MessageChannel;
  useCase: OutboundUseCase;
  recipientAddress: string;
  payload: unknown;
  providerName: string;
  templateKey?: string | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  maxRetryCount?: number;
};

export type ProviderSendRequest = {
  messageId: string;
  shopDomain: string;
  recipientAddress: string;
  payload: unknown;
  callbackCorrelationId: string;
};

export type ProviderSendSuccess = {
  ok: true;
  providerMessageId: string;
  rawResponse?: unknown;
};

export type ProviderFailureCode =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "SERVICE_UNAVAILABLE"
  | "AUTH_ERROR"
  | "INVALID_RECIPIENT"
  | "UNKNOWN";

export type ProviderSendFailure = {
  ok: false;
  code: ProviderFailureCode;
  message: string;
  retryAfterSeconds?: number;
  rawResponse?: unknown;
};

export type ProviderSendResult = ProviderSendSuccess | ProviderSendFailure;

export interface OutboundProviderAdapter {
  readonly providerName: string;
  sendMessage(input: ProviderSendRequest): Promise<ProviderSendResult>;
}

export class PlaceholderWhatsAppProviderAdapter implements OutboundProviderAdapter {
  readonly providerName = "whatsapp_placeholder";

  async sendMessage(input: ProviderSendRequest): Promise<ProviderSendResult> {
    void input;

    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "Placeholder adapter: provider integration is not enabled yet.",
    };
  }
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { parseError: true };
  }
}

function buildCallbackCorrelationId(messageId: string): string {
  const suffix = createHash("sha256")
    .update(`${messageId}:${Date.now().toString()}`)
    .digest("hex")
    .slice(0, 12);

  return `outbound:${messageId}:${suffix}`;
}

export function classifyProviderFailure(
  failure: ProviderSendFailure,
): { retryClass: RetryClass; retryable: boolean } {
  if (failure.code === "RATE_LIMIT") {
    return { retryClass: "RATE_LIMITED", retryable: true };
  }

  if (failure.code === "TIMEOUT") {
    return { retryClass: "TRANSIENT", retryable: true };
  }

  if (failure.code === "SERVICE_UNAVAILABLE") {
    return { retryClass: "PROVIDER_UNAVAILABLE", retryable: true };
  }

  return { retryClass: "NON_RETRYABLE", retryable: false };
}

function computeNextRetryAt(input: {
  retryClass: RetryClass;
  retryCount: number;
  retryAfterSeconds?: number;
}): Date {
  if (typeof input.retryAfterSeconds === "number" && input.retryAfterSeconds > 0) {
    return new Date(Date.now() + input.retryAfterSeconds * 1000);
  }

  const baseByClass: Record<RetryClass, number> = {
    RATE_LIMITED: 120,
    TRANSIENT: 60,
    PROVIDER_UNAVAILABLE: 180,
    NON_RETRYABLE: 0,
  };

  const baseSeconds = baseByClass[input.retryClass] || 60;
  const backoffMultiplier = Math.max(1, 2 ** (input.retryCount - 1));

  return new Date(Date.now() + baseSeconds * backoffMultiplier * 1000);
}

export async function createOutboundMessage(input: CreateOutboundMessageInput) {
  await ensureShopFoundation(input.shopDomain);

  const payload = JSON.stringify(input.payload);
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
  const message = await db.outboundMessage.create({
    data: {
      shopDomain: input.shopDomain,
      channel: input.channel,
      useCase: input.useCase,
      recipientAddress: input.recipientAddress,
      payload,
      metadata,
      templateKey: input.templateKey ?? null,
      providerName: input.providerName,
      idempotencyKey: input.idempotencyKey ?? null,
      status: "PENDING" satisfies OutboundMessageStatus,
      maxRetryCount: input.maxRetryCount ?? 3,
    },
  });

  logOperationalEvent({
    domain: "outbound",
    event: "queued",
    shopDomain: input.shopDomain,
    entityId: message.id,
    metadata: {
      providerName: input.providerName,
      useCase: input.useCase,
      channel: input.channel,
    },
  });

  return message;
}

export async function dispatchOutboundMessage(args: {
  messageId: string;
  provider: OutboundProviderAdapter;
}) {
  const message = await db.outboundMessage.findUnique({ where: { id: args.messageId } });

  if (!message) {
    throw new Error(`[outbound] message not found id=${args.messageId}`);
  }

  if (message.status === "DELIVERED" || message.status === "DEAD_LETTER") {
    return message;
  }

  const callbackCorrelationId = message.callbackCorrelationId ?? buildCallbackCorrelationId(message.id);

  await db.outboundMessage.update({
    where: { id: message.id },
    data: {
      status: "SENDING" satisfies OutboundMessageStatus,
      callbackCorrelationId,
      lockedAt: new Date(),
      statusReason: null,
    },
  });

  const attemptNumber = message.retryCount + 1;
  const attempt = await db.outboundMessageAttempt.create({
    data: {
      outboundMessageId: message.id,
      attemptNumber,
      providerName: args.provider.providerName,
      requestPayload: JSON.stringify({
        messageId: message.id,
        recipientAddress: message.recipientAddress,
      }),
      status: "INITIATED" satisfies AttemptStatus,
    },
  });

  const sendResult = await args.provider.sendMessage({
    messageId: message.id,
    shopDomain: message.shopDomain,
    recipientAddress: message.recipientAddress,
    payload: parseJsonObject(message.payload),
    callbackCorrelationId,
  });

  if (sendResult.ok) {
    await db.outboundMessageAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUCCEEDED" satisfies AttemptStatus,
        providerMessageId: sendResult.providerMessageId,
        responsePayload: JSON.stringify(sendResult.rawResponse ?? null),
        retryClass: "NON_RETRYABLE" satisfies RetryClass,
        completedAt: new Date(),
      },
    });

    return db.outboundMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT" satisfies OutboundMessageStatus,
        providerName: args.provider.providerName,
        providerMessageId: sendResult.providerMessageId,
        retryClass: "NON_RETRYABLE" satisfies RetryClass,
        sentAt: new Date(),
        lockedAt: null,
      },
    });
  }

  const classification = classifyProviderFailure(sendResult);
  const retryCount = message.retryCount + 1;
  const canRetry = classification.retryable && retryCount <= message.maxRetryCount;

  const nextRetryAt = canRetry
    ? computeNextRetryAt({
        retryClass: classification.retryClass,
        retryCount,
        retryAfterSeconds: sendResult.retryAfterSeconds,
      })
    : null;

  const finalStatus: OutboundMessageStatus = canRetry ? "RETRY_SCHEDULED" : "FAILED";

  await db.outboundMessageAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "FAILED" satisfies AttemptStatus,
      retryClass: classification.retryClass,
      errorCode: sendResult.code,
      errorMessage: sendResult.message,
      responsePayload: JSON.stringify(sendResult.rawResponse ?? null),
      completedAt: new Date(),
    },
  });

  const failedMessage = await db.outboundMessage.update({
    where: { id: message.id },
    data: {
      providerName: args.provider.providerName,
      status: finalStatus,
      statusReason: sendResult.message,
      retryClass: classification.retryClass,
      retryCount,
      nextRetryAt,
      lockedAt: null,
      failedAt: canRetry ? null : new Date(),
      deadLetteredAt:
        !canRetry && classification.retryable ? new Date() : null,
      escalatedAt:
        !canRetry && classification.retryable ? new Date() : null,
    },
  });

  logOperationalEvent({
    domain: "outbound",
    event: canRetry ? "dispatch_failed_retry_scheduled" : "dispatch_failed_terminal",
    level: "error",
    shopDomain: message.shopDomain,
    entityId: message.id,
    reason: sendResult.message,
    metadata: {
      providerName: args.provider.providerName,
      code: sendResult.code,
      retryClass: classification.retryClass,
      retryable: canRetry,
      retryCount,
      maxRetryCount: message.maxRetryCount,
      nextRetryAt: nextRetryAt?.toISOString() ?? null,
    },
  });

  return failedMessage;
}

export async function recordProviderCallbackEvent(input: {
  shopDomain: string;
  providerName: string;
  eventType: string;
  payload: unknown;
  headers: Record<string, string | null>;
  externalEventId?: string | null;
  providerMessageId?: string | null;
  callbackCorrelationId?: string | null;
}) {
  await ensureShopFoundation(input.shopDomain);

  const dedupeFingerprint = JSON.stringify({
    shopDomain: input.shopDomain,
    providerName: input.providerName,
    eventType: input.eventType,
    externalEventId: input.externalEventId ?? null,
    providerMessageId: input.providerMessageId ?? null,
    callbackCorrelationId: input.callbackCorrelationId ?? null,
    payload: input.payload,
  });

  const dedupeKey = createHash("sha256").update(dedupeFingerprint).digest("hex");

  return db.outboundMessageCallback.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      shopDomain: input.shopDomain,
      providerName: input.providerName,
      eventType: input.eventType,
      payload: JSON.stringify(input.payload),
      headersPayload: JSON.stringify(input.headers),
      externalEventId: input.externalEventId ?? null,
      providerMessageId: input.providerMessageId ?? null,
      callbackCorrelationId: input.callbackCorrelationId ?? null,
      dedupeKey,
      status: "RECEIVED" satisfies CallbackEventStatus,
    },
  });
}

export async function reconcileProviderCallback(input: {
  callbackId: string;
  resolution: "DELIVERED" | "FAILED";
  reason?: string;
}) {
  const callback = await db.outboundMessageCallback.update({
    where: { id: input.callbackId },
    data: {
      processedAt: new Date(),
    },
  });

  const message = await db.outboundMessage.findFirst({
    where: {
      OR: [
        { callbackCorrelationId: callback.callbackCorrelationId },
        { providerMessageId: callback.providerMessageId },
      ],
    },
  });

  if (!message) {
    await db.outboundMessageCallback.update({
      where: { id: callback.id },
      data: {
        status: "FAILED" satisfies CallbackEventStatus,
        reconciliationError: "No matching outbound message was found for callback correlation.",
        failedAt: new Date(),
      },
    });

    logOperationalEvent({
      domain: "outbound",
      event: "callback_unresolved",
      level: "warn",
      shopDomain: callback.shopDomain,
      entityId: callback.id,
      reason: "No matching outbound message was found for callback correlation.",
      metadata: {
        callbackCorrelationId: callback.callbackCorrelationId,
        providerMessageId: callback.providerMessageId,
      },
    });
    return null;
  }

  const nextMessageStatus: OutboundMessageStatus =
    input.resolution === "DELIVERED" ? "DELIVERED" : "FAILED";

  await db.outboundMessage.update({
    where: { id: message.id },
    data: {
      status: nextMessageStatus,
      deliveredAt: input.resolution === "DELIVERED" ? new Date() : null,
      failedAt: input.resolution === "FAILED" ? new Date() : null,
      statusReason: input.reason ?? null,
    },
  });

  await db.outboundMessageCallback.update({
    where: { id: callback.id },
    data: {
      status: "RECONCILED" satisfies CallbackEventStatus,
      reconciledMessageId: message.id,
      reconciliationError: null,
    },
  });

  return message.id;
}
