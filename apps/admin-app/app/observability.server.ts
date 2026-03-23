type LogLevel = "info" | "warn" | "error";

type OperationalLogInput = {
  domain:
    | "webhook_intake"
    | "outbound"
    | "order_confirmation"
    | "order_status_update"
    | "cart_recovery"
    | "campaign"
    | "workflow"
    | "support_tools";
  event: string;
  level?: LogLevel;
  shopDomain?: string;
  webhookEventId?: string | null;
  entityId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

function sanitizeReason(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 400) : null;
}

export function logOperationalEvent(input: OperationalLogInput): void {
  const logBody = {
    ts: new Date().toISOString(),
    domain: input.domain,
    event: input.event,
    shopDomain: input.shopDomain ?? null,
    webhookEventId: input.webhookEventId ?? null,
    entityId: input.entityId ?? null,
    reason: sanitizeReason(input.reason),
    metadata: input.metadata ?? {},
  };

  const payload = JSON.stringify(logBody);

  if (input.level === "warn") {
    console.warn(payload);
    return;
  }

  if (input.level === "error") {
    console.error(payload);
    return;
  }

  console.info(payload);
}

