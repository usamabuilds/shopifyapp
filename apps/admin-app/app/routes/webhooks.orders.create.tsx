import type { ActionFunctionArgs } from "react-router";

import { processOrderCreatedConfirmation } from "../automations.order-confirmation.server";
import { authenticate } from "../shopify.server";
import {
  markWebhookIntakeFailure,
  markWebhookIntakeProcessed,
  processShopifyWebhookIntake,
} from "../webhooks.shopify-intake.server";

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

    await markWebhookIntakeProcessed({
      webhookEventId: intake.webhookEventId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";

    await markWebhookIntakeFailure({
      webhookEventId: intake.webhookEventId,
      reason,
    });

    console.error(
      `[order-confirmation] webhook processing failed. shop=${shop} eventId=${intake.webhookEventId} reason=${reason}`,
    );
  }

  return new Response();
};
