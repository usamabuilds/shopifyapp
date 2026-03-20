import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";
import { processShopifyWebhookIntake } from "../webhooks.shopify-intake.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  const intake = await processShopifyWebhookIntake({
    request,
    shop,
    topic,
    payload,
  });

  const currentScopes = Array.isArray(payload.current)
    ? payload.current.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: currentScopes.toString(),
      },
    });
  }

  console.info(
    `[webhook-intake] app/scopes_update processed for ${shop}. eventId=${intake.webhookEventId}`,
  );

  return new Response();
};
