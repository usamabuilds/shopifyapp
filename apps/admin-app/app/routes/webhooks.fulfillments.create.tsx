import type { ActionFunctionArgs } from "react-router";

import { handleOrderStatusUpdateWebhookAction } from "../webhooks.order-status-update-handler.server";

export const action = async (args: ActionFunctionArgs) => {
  return handleOrderStatusUpdateWebhookAction(args);
};
