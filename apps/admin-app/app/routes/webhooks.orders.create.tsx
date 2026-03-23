import type { ActionFunctionArgs } from "react-router";

import {
  attributeRecoveredOrder,
  dispatchDueCartRecoveries,
} from "../automations.cart-recovery.server";
import { processOrderCreatedConfirmation } from "../automations.order-confirmation.server";
import { authenticate } from "../shopify.server";
import {
  markWebhookIntakeFailure,
  markWebhookIntakeProcessed,
  processShopifyWebhookIntake,
} from "../webhooks.shopify-intake.server";
import { logOperationalEvent } from "../observability.server";

export const action = async ({ request }: ActionFunctionArgs) => {
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
    await processOrderCreatedConfirmation({
      shopDomain: shop,
      webhookEventId: intake.webhookEventId,
      payload,
    });
    await attributeRecoveredOrder({
      shopDomain: shop,
      webhookEventId: intake.webhookEventId,
      payload,
    });
    await dispatchDueCartRecoveries({
      shopDomain: shop,
      limit: 20,
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
      domain: "order_confirmation",
      event: "webhook_processing_failed",
      level: "error",
      shopDomain: shop,
      webhookEventId: intake.webhookEventId,
      reason,
      metadata: { topic },
    });
  }

  return new Response();
};
