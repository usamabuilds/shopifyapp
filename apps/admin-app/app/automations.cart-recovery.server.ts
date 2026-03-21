import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";
import {
  PlaceholderWhatsAppProviderAdapter,
  createOutboundMessage,
  dispatchOutboundMessage,
} from "./messaging/outbound-messaging.server";

type CartRecoveryState =
  | "PENDING_WAIT"
  | "SKIPPED_DISABLED"
  | "SKIPPED_NOT_ELIGIBLE"
  | "SKIPPED_MISSING_TEMPLATE"
  | "DUPLICATE_SUPPRESSED"
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "RECOVERED";

type CartRecoveryRecord = {
  id: string;
  shopDomain: string;
  checkoutId: string;
  state: CartRecoveryState;
  stateReason: string | null;
  recipientPhone: string | null;
  customerId: string | null;
  templateKey: string | null;
  checkoutSubtotalAmount: string | null;
  checkoutCurrencyCode: string | null;
  recoveryEligibleAt: Date;
  outboundMessageId: string | null;
  sentAt: Date | null;
  recoveredOrderId: string | null;
  recoveredOrderNumber: string | null;
  recoveredRevenueAmount: string | null;
  recoveredCurrencyCode: string | null;
  updatedAt: Date;
};

type ShopSettingsRecord = {
  cartRecoveryEnabled: boolean;
  cartRecoveryTemplateKey: string | null;
  cartRecoveryWaitMinutes: number;
};

type PrismaCartRecoveryDb = {
  shopSettings: {
    upsert: (args: Record<string, unknown>) => Promise<ShopSettingsRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<ShopSettingsRecord | null>;
  };
  cartRecovery: {
    create: (args: Record<string, unknown>) => Promise<CartRecoveryRecord>;
    update: (args: Record<string, unknown>) => Promise<CartRecoveryRecord>;
    findFirst: (args: Record<string, unknown>) => Promise<CartRecoveryRecord | null>;
    findMany: (args: Record<string, unknown>) => Promise<CartRecoveryRecord[]>;
  };
};

const db = prisma as unknown as PrismaCartRecoveryDb;

export type CartRecoverySettings = {
  enabled: boolean;
  templateKey: string;
  waitMinutes: number;
};

type NormalizedCheckoutEvent = {
  checkoutId: string | null;
  checkoutToken: string | null;
  cartToken: string | null;
  checkoutUpdatedAt: Date;
  checkoutCompletedAt: string | null;
  recipientPhone: string | null;
  email: string | null;
  customerId: string | null;
  subtotalPrice: string | null;
  currencyCode: string | null;
};

type NormalizedOrderCreatedPayload = {
  orderId: string | null;
  orderNumber: string | null;
  orderCreatedAt: string | null;
  recipientPhone: string | null;
  customerId: string | null;
  totalPrice: string | null;
  currencyCode: string | null;
};

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function parseBooleanInput(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function parseWaitMinutes(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return 60;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return 60;
  }

  return Math.min(7 * 24 * 60, Math.max(1, parsed));
}

function normalizeIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCheckoutEvent(payload: unknown): NormalizedCheckoutEvent {
  if (!payload || typeof payload !== "object") {
    return {
      checkoutId: null,
      checkoutToken: null,
      cartToken: null,
      checkoutUpdatedAt: new Date(),
      checkoutCompletedAt: null,
      recipientPhone: null,
      email: null,
      customerId: null,
      subtotalPrice: null,
      currencyCode: null,
    };
  }

  const typedPayload = payload as Record<string, unknown>;
  const customerPayload =
    typedPayload.customer && typeof typedPayload.customer === "object"
      ? (typedPayload.customer as Record<string, unknown>)
      : null;

  const checkoutUpdatedAt =
    normalizeIsoDate(typedPayload.updated_at)
    ?? normalizeIsoDate(typedPayload.created_at)
    ?? new Date();

  return {
    checkoutId: normalizeId(typedPayload.id),
    checkoutToken: normalizeOptionalString(String(typedPayload.token ?? "")) ?? null,
    cartToken: normalizeOptionalString(String(typedPayload.cart_token ?? "")) ?? null,
    checkoutUpdatedAt,
    checkoutCompletedAt: normalizeOptionalString(String(typedPayload.completed_at ?? "")) ?? null,
    recipientPhone:
      normalizeOptionalString(String(typedPayload.phone ?? ""))
      ?? normalizeOptionalString(String(customerPayload?.phone ?? ""))
      ?? null,
    email: normalizeOptionalString(String(typedPayload.email ?? "")) ?? null,
    customerId: normalizeId(customerPayload?.id),
    subtotalPrice: normalizeOptionalString(String(typedPayload.subtotal_price ?? "")) ?? null,
    currencyCode:
      normalizeOptionalString(String(typedPayload.currency ?? ""))
      ?? normalizeOptionalString(String(typedPayload.presentment_currency ?? ""))
      ?? null,
  };
}

function normalizeOrderCreatedPayload(payload: unknown): NormalizedOrderCreatedPayload {
  if (!payload || typeof payload !== "object") {
    return {
      orderId: null,
      orderNumber: null,
      orderCreatedAt: null,
      recipientPhone: null,
      customerId: null,
      totalPrice: null,
      currencyCode: null,
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
    orderCreatedAt: normalizeOptionalString(String(typedPayload.created_at ?? "")) ?? null,
    recipientPhone:
      normalizeOptionalString(String(typedPayload.phone ?? ""))
      ?? normalizeOptionalString(String(customerPayload?.phone ?? ""))
      ?? null,
    customerId: normalizeId(customerPayload?.id),
    totalPrice: normalizeOptionalString(String(typedPayload.total_price ?? "")) ?? null,
    currencyCode:
      normalizeOptionalString(String(typedPayload.currency ?? ""))
      ?? normalizeOptionalString(String(typedPayload.presentment_currency ?? ""))
      ?? null,
  };
}

function buildRecoveryDedupeKey(shopDomain: string, checkoutId: string): string {
  return `cart-recovery:${shopDomain}:${checkoutId}`;
}

function buildRecoveryPayload(event: NormalizedCheckoutEvent) {
  return {
    useCase: "cart_recovery",
    checkoutId: event.checkoutId,
    checkoutToken: event.checkoutToken,
    text: "You left items in your cart. Complete your checkout when you're ready.",
  };
}

function isStateTerminal(state: CartRecoveryState): boolean {
  return (
    state === "SKIPPED_DISABLED"
    || state === "SKIPPED_NOT_ELIGIBLE"
    || state === "SKIPPED_MISSING_TEMPLATE"
    || state === "FAILED"
    || state === "RECOVERED"
  );
}

export function parseCartRecoverySettingsForm(formData: FormData): CartRecoverySettings {
  return {
    enabled: parseBooleanInput(formData.get("cartRecoveryEnabled")),
    templateKey: normalizeOptionalString(formData.get("cartRecoveryTemplateKey")) ?? "",
    waitMinutes: parseWaitMinutes(formData.get("cartRecoveryWaitMinutes")),
  };
}

export async function getCartRecoverySettings(shopDomain: string): Promise<CartRecoverySettings> {
  const shop = await ensureShopFoundation(shopDomain);

  const settings = await db.shopSettings.findUnique({
    where: {
      shopId: shop.id,
    },
  });

  return {
    enabled: settings?.cartRecoveryEnabled ?? false,
    templateKey: settings?.cartRecoveryTemplateKey ?? "",
    waitMinutes: settings?.cartRecoveryWaitMinutes ?? 60,
  };
}

export async function updateCartRecoverySettings(shopDomain: string, input: CartRecoverySettings) {
  const shop = await ensureShopFoundation(shopDomain);

  return db.shopSettings.upsert({
    where: {
      shopId: shop.id,
    },
    update: {
      cartRecoveryEnabled: input.enabled,
      cartRecoveryTemplateKey: input.templateKey || null,
      cartRecoveryWaitMinutes: input.waitMinutes,
    },
    create: {
      shopId: shop.id,
      cartRecoveryEnabled: input.enabled,
      cartRecoveryTemplateKey: input.templateKey || null,
      cartRecoveryWaitMinutes: input.waitMinutes,
    },
  });
}

export async function processCheckoutUpdatedForRecovery(input: {
  shopDomain: string;
  webhookEventId: string;
  payload: unknown;
}) {
  // Foundation limitation: we rely on checkouts/update webhook snapshots in this first version.
  // This app context does not run a dedicated cart/checkout heartbeat worker yet.
  await ensureShopFoundation(input.shopDomain);

  const settings = await getCartRecoverySettings(input.shopDomain);
  const event = normalizeCheckoutEvent(input.payload);

  if (!event.checkoutId) {
    return { processed: false, reason: "missing_checkout_id", recoveryId: null };
  }

  const dedupeKey = buildRecoveryDedupeKey(input.shopDomain, event.checkoutId);
  const recoveryEligibleAt = new Date(
    event.checkoutUpdatedAt.getTime() + settings.waitMinutes * 60 * 1000,
  );

  let recovery: CartRecoveryRecord;

  try {
    recovery = await db.cartRecovery.create({
      data: {
        shopDomain: input.shopDomain,
        webhookEventId: input.webhookEventId,
        checkoutId: event.checkoutId,
        checkoutToken: event.checkoutToken,
        cartToken: event.cartToken,
        dedupeKey,
        state: "PENDING_WAIT" satisfies CartRecoveryState,
        stateReason: null,
        recipientPhone: event.recipientPhone,
        customerId: event.customerId,
        checkoutSubtotalAmount: event.subtotalPrice,
        checkoutCurrencyCode: event.currencyCode,
        normalizedPayload: JSON.stringify({ payload: input.payload, normalized: event }),
        recoveryEligibleAt,
      },
    });
  } catch {
    const existing = await db.cartRecovery.findFirst({
      where: {
        dedupeKey,
      },
    });

    if (!existing) {
      throw new Error(`failed_to_create_cart_recovery_record:${dedupeKey}`);
    }

    if (isStateTerminal(existing.state)) {
      return {
        processed: true,
        reason: "duplicate_suppressed",
        recoveryId: existing.id,
      };
    }

    recovery = await db.cartRecovery.update({
      where: { id: existing.id },
      data: {
        webhookEventId: input.webhookEventId,
        checkoutToken: event.checkoutToken,
        cartToken: event.cartToken,
        recipientPhone: event.recipientPhone,
        customerId: event.customerId,
        checkoutSubtotalAmount: event.subtotalPrice,
        checkoutCurrencyCode: event.currencyCode,
        templateKey: settings.templateKey || null,
        normalizedPayload: JSON.stringify({ payload: input.payload, normalized: event }),
        recoveryEligibleAt,
        state: "PENDING_WAIT" satisfies CartRecoveryState,
        stateReason: null,
        outboundMessageId: null,
        sentAt: null,
        processedAt: null,
        failedAt: null,
        lastEvaluatedAt: new Date(),
      },
    });
  }

  if (!settings.enabled) {
    await db.cartRecovery.update({
      where: { id: recovery.id },
      data: {
        state: "SKIPPED_DISABLED" satisfies CartRecoveryState,
        stateReason: "cart_recovery_disabled",
        processedAt: new Date(),
        lastEvaluatedAt: new Date(),
      },
    });

    return { processed: true, reason: "cart_recovery_disabled", recoveryId: recovery.id };
  }

  if (event.checkoutCompletedAt) {
    await db.cartRecovery.update({
      where: { id: recovery.id },
      data: {
        state: "SKIPPED_NOT_ELIGIBLE" satisfies CartRecoveryState,
        stateReason: "checkout_already_completed",
        processedAt: new Date(),
        lastEvaluatedAt: new Date(),
      },
    });

    return { processed: true, reason: "checkout_already_completed", recoveryId: recovery.id };
  }

  if (!event.recipientPhone) {
    await db.cartRecovery.update({
      where: { id: recovery.id },
      data: {
        state: "SKIPPED_NOT_ELIGIBLE" satisfies CartRecoveryState,
        stateReason: "missing_recipient_phone",
        processedAt: new Date(),
        lastEvaluatedAt: new Date(),
      },
    });

    return { processed: true, reason: "missing_recipient_phone", recoveryId: recovery.id };
  }

  if (!settings.templateKey) {
    await db.cartRecovery.update({
      where: { id: recovery.id },
      data: {
        state: "SKIPPED_MISSING_TEMPLATE" satisfies CartRecoveryState,
        stateReason: "missing_cart_recovery_template",
        processedAt: new Date(),
        lastEvaluatedAt: new Date(),
      },
    });

    return { processed: true, reason: "missing_template", recoveryId: recovery.id };
  }

  await db.cartRecovery.update({
    where: { id: recovery.id },
    data: {
      templateKey: settings.templateKey,
      state: "PENDING_WAIT" satisfies CartRecoveryState,
      stateReason: `waiting_${settings.waitMinutes}_minutes`,
      lastEvaluatedAt: new Date(),
    },
  });

  return { processed: true, reason: "waiting_window", recoveryId: recovery.id };
}

export async function dispatchDueCartRecoveries(input: { shopDomain: string; limit?: number }) {
  await ensureShopFoundation(input.shopDomain);

  const now = new Date();

  const dueRecoveries = await db.cartRecovery.findMany({
    where: {
      shopDomain: input.shopDomain,
      state: "PENDING_WAIT",
      recoveryEligibleAt: {
        lte: now,
      },
    },
    orderBy: {
      recoveryEligibleAt: "asc",
    },
    take: input.limit ?? 20,
  });

  let dispatched = 0;

  for (const recovery of dueRecoveries) {
    if (!recovery.recipientPhone) {
      await db.cartRecovery.update({
        where: { id: recovery.id },
        data: {
          state: "SKIPPED_NOT_ELIGIBLE" satisfies CartRecoveryState,
          stateReason: "missing_recipient_phone",
          processedAt: new Date(),
          lastEvaluatedAt: new Date(),
        },
      });
      continue;
    }

    if (!recovery.templateKey) {
      await db.cartRecovery.update({
        where: { id: recovery.id },
        data: {
          state: "SKIPPED_MISSING_TEMPLATE" satisfies CartRecoveryState,
          stateReason: "missing_cart_recovery_template",
          processedAt: new Date(),
          lastEvaluatedAt: new Date(),
        },
      });
      continue;
    }

    const outboundMessage = await createOutboundMessage({
      shopDomain: input.shopDomain,
      channel: "WHATSAPP",
      useCase: "cart_recovery",
      recipientAddress: recovery.recipientPhone,
      providerName: "whatsapp_placeholder",
      payload: buildRecoveryPayload({
        checkoutId: recovery.checkoutId,
        checkoutToken: null,
        cartToken: null,
        checkoutUpdatedAt: new Date(),
        checkoutCompletedAt: null,
        recipientPhone: recovery.recipientPhone,
        email: null,
        customerId: recovery.customerId,
        subtotalPrice: recovery.checkoutSubtotalAmount,
        currencyCode: recovery.checkoutCurrencyCode,
      }),
      templateKey: recovery.templateKey,
      metadata: {
        checkoutId: recovery.checkoutId,
        recoveryId: recovery.id,
      },
      idempotencyKey: `cart-recovery-send:${input.shopDomain}:${recovery.checkoutId}`,
    });

    await db.cartRecovery.update({
      where: { id: recovery.id },
      data: {
        state: "QUEUED" satisfies CartRecoveryState,
        stateReason: null,
        outboundMessageId: outboundMessage.id,
      },
    });

    const dispatchResult = await dispatchOutboundMessage({
      messageId: outboundMessage.id,
      provider: new PlaceholderWhatsAppProviderAdapter(),
    });

    const isSent = dispatchResult.status === "SENT" || dispatchResult.status === "DELIVERED";

    await db.cartRecovery.update({
      where: { id: recovery.id },
      data: {
        state: isSent ? ("SENT" satisfies CartRecoveryState) : ("FAILED" satisfies CartRecoveryState),
        stateReason: isSent ? null : dispatchResult.statusReason ?? "dispatch_failed",
        sentAt: isSent ? new Date() : null,
        processedAt: new Date(),
        failedAt: isSent ? null : new Date(),
        lastEvaluatedAt: new Date(),
      },
    });

    dispatched += 1;
  }

  return { dispatched, scanned: dueRecoveries.length };
}

export async function attributeRecoveredOrder(input: {
  shopDomain: string;
  webhookEventId: string;
  payload: unknown;
}) {
  await ensureShopFoundation(input.shopDomain);

  const order = normalizeOrderCreatedPayload(input.payload);

  if (!order.orderId) {
    return { attributed: false, reason: "missing_order_id", recoveryId: null };
  }

  if (!order.recipientPhone && !order.customerId) {
    return { attributed: false, reason: "missing_attribution_identity", recoveryId: null };
  }

  const matchOrFilters: Array<{ recipientPhone: string } | { customerId: string }> = [
    order.recipientPhone ? { recipientPhone: order.recipientPhone } : null,
    order.customerId ? { customerId: order.customerId } : null,
  ].filter((value): value is { recipientPhone: string } | { customerId: string } => Boolean(value));

  const candidate = await db.cartRecovery.findFirst({
    where: {
      shopDomain: input.shopDomain,
      state: "SENT",
      recoveredOrderId: null,
      OR: matchOrFilters,
    },
    orderBy: {
      sentAt: "desc",
    },
  });

  if (!candidate) {
    return { attributed: false, reason: "no_matching_recovery", recoveryId: null };
  }

  const orderCreatedAt = normalizeIsoDate(order.orderCreatedAt) ?? new Date();
  const candidateSentAt = candidate.sentAt ? new Date(candidate.sentAt) : new Date(candidate.updatedAt);
  const attributionWindowMs = 7 * 24 * 60 * 60 * 1000;

  if (Math.abs(orderCreatedAt.getTime() - candidateSentAt.getTime()) > attributionWindowMs) {
    return { attributed: false, reason: "outside_attribution_window", recoveryId: candidate.id };
  }

  await db.cartRecovery.update({
    where: { id: candidate.id },
    data: {
      state: "RECOVERED" satisfies CartRecoveryState,
      stateReason: null,
      recoveredAt: new Date(),
      recoveredOrderId: order.orderId,
      recoveredOrderNumber: order.orderNumber,
      recoveredRevenueAmount: order.totalPrice,
      recoveredCurrencyCode: order.currencyCode,
      processedAt: new Date(),
      lastEvaluatedAt: new Date(),
      webhookEventId: input.webhookEventId,
    },
  });

  return { attributed: true, reason: "recovered_order_attributed", recoveryId: candidate.id };
}

export async function listRecentCartRecoveries(shopDomain: string, limit = 30) {
  await ensureShopFoundation(shopDomain);

  return db.cartRecovery.findMany({
    where: {
      shopDomain,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
}
