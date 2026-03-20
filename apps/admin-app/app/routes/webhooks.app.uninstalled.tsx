import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { ensureShopFoundation } from "../models.shop.server";
import { authenticate } from "../shopify.server";
import { processShopifyWebhookIntake } from "../webhooks.shopify-intake.server";

type PrismaShopWriter = {
  shop: {
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

const prisma = db as unknown as PrismaShopWriter;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, session, topic } = await authenticate.webhook(request);

  const intake = await processShopifyWebhookIntake({
    request,
    shop,
    topic,
    payload,
  });

  await ensureShopFoundation(shop);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  await prisma.shop.update({
    where: {
      shopDomain: shop,
    },
    data: {
      appInstalled: false,
      uninstalledAt: new Date(),
    },
  });

  console.info(
    `[webhook-intake] app/uninstalled processed for ${shop}. eventId=${intake.webhookEventId}`,
  );

  return new Response();
};
