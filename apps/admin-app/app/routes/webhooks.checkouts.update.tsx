import type { ActionFunctionArgs } from "react-router";

import { handleCartRecoveryWebhookAction } from "../webhooks.cart-recovery-handler.server";

export const action = async (args: ActionFunctionArgs) => {
  return handleCartRecoveryWebhookAction(args);
};
