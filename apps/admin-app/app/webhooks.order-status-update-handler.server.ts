import type { ActionFunctionArgs } from "react-router";

import { processOrderStatusUpdate } from "./automations.order-status-updates.server";
import { logOperationalEvent } from "./observability.server";
import { authenticate } from "./shopify.server";
import {
  markWebhookIntakeFailure,
  markWebhookIntakeProcessed,
  processShopifyWebhookIntake,
} from "./webhooks.shopify-intake.server";

export async function handleOrderStatusUpdateWebhookAction({ request }: ActionFunctionArgs) {
  const { payload, topic, shop } = await authenticate.webhook(request);

  const intake = await processShopifyWebhookIntake({
    request,
    shop,
    topic,
    payload,
  });

  if (intake.isDuplicate) {
    return new Response();
  }

  try {
    await processOrderStatusUpdate({
      shopDomain: shop,
      webhookEventId: intake.webhookEventId,
      topic,
      payload,
    });

    await markWebhookIntakeProcessed({
      webhookEventId: intake.webhookEventId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";

    await markWebhookIntakeFailure({
      webhookEventId: intake.webhookEventId,
      reason,
    });

    logOperationalEvent({
      domain: "order_status_update",
      event: "webhook_processing_failed",
      level: "error",
      shopDomain: shop,
      webhookEventId: intake.webhookEventId,
      reason,
      metadata: { topic },
    });
  }

  return new Response();
}
