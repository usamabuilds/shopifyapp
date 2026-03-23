import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import {
  dispatchDueCartRecoveries,
  getCartRecoverySettings,
  listRecentCartRecoveries,
  parseCartRecoverySettingsForm,
  updateCartRecoverySettings,
} from "../automations.cart-recovery.server";
import {
  getOrderConfirmationSettings,
  listRecentOrderConfirmations,
  parseOrderConfirmationSettingsForm,
  updateOrderConfirmationSettings,
} from "../automations.order-confirmation.server";
import {
  getOrderStatusUpdateSettings,
  listRecentOrderStatusUpdates,
  parseOrderStatusUpdateSettingsForm,
  updateOrderStatusUpdateSettings,
} from "../automations.order-status-updates.server";
import { authenticate } from "../shopify.server";

type AutomationKey = "order-confirmation" | "order-status" | "cart-recovery";

const automationLabels: Record<AutomationKey, string> = {
  "order-confirmation": "Order confirmation",
  "order-status": "Order status updates",
  "cart-recovery": "Abandoned cart recovery",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedAutomationRaw = url.searchParams.get("automation");

  const [
    confirmationSettings,
    recentConfirmations,
    orderStatusSettings,
    recentStatusUpdates,
    cartRecoverySettings,
    recentCartRecoveries,
  ] = await Promise.all([
    getOrderConfirmationSettings(session.shop),
    listRecentOrderConfirmations(session.shop),
    getOrderStatusUpdateSettings(session.shop),
    listRecentOrderStatusUpdates(session.shop),
    getCartRecoverySettings(session.shop),
    listRecentCartRecoveries(session.shop),
  ]);

  await dispatchDueCartRecoveries({
    shopDomain: session.shop,
    limit: 20,
  });

  const selectedAutomation: AutomationKey =
    selectedAutomationRaw === "order-status" || selectedAutomationRaw === "cart-recovery"
      ? selectedAutomationRaw
      : "order-confirmation";

  return {
    selectedAutomation,
    confirmationSettings,
    recentConfirmations,
    orderStatusSettings,
    recentStatusUpdates,
    cartRecoverySettings,
    recentCartRecoveries,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-order-status-settings") {
    const input = parseOrderStatusUpdateSettingsForm(formData);
    const missingStatusTemplates = Object.entries(input.templateByStatus)
      .filter(([, value]) => !value)
      .map(([status]) => status);

    if (input.enabled && missingStatusTemplates.length > 0) {
      return {
        saved: "order-status" as const,
        blocked: true as const,
        message: `Cannot enable order status updates until every status has a template key. Missing: ${missingStatusTemplates.join(", ")}.`,
      };
    }

    await updateOrderStatusUpdateSettings(session.shop, input);

    return { saved: "order-status" as const };
  }

  if (intent === "save-cart-recovery-settings") {
    const input = parseCartRecoverySettingsForm(formData);

    if (input.enabled && !input.templateKey) {
      return {
        saved: "cart-recovery" as const,
        blocked: true as const,
        message: "Cannot enable cart recovery without a template key.",
      };
    }

    await updateCartRecoverySettings(session.shop, input);

    return { saved: "cart-recovery" as const };
  }

  const input = parseOrderConfirmationSettingsForm(formData);

  if (input.enabled && !input.templateKey) {
    return {
      saved: "order-confirmation" as const,
      blocked: true as const,
      message: "Cannot enable order confirmation without a template key.",
    };
  }

  await updateOrderConfirmationSettings(session.shop, input);

  return { saved: "order-confirmation" as const };
};

export default function AutomationsPage() {
  const {
    selectedAutomation,
    confirmationSettings,
    recentConfirmations,
    orderStatusSettings,
    recentStatusUpdates,
    cartRecoverySettings,
    recentCartRecoveries,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const orderConfirmationWarnings = [
    confirmationSettings.enabled && !confirmationSettings.templateKey
      ? "Template key is empty. Messages cannot be sent until this is configured."
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  const orderStatusMissingTemplates = Object.entries(orderStatusSettings.templateByStatus)
    .filter(([, value]) => !value)
    .map(([status]) => status);

  const orderStatusWarnings = [
    orderStatusSettings.enabled && orderStatusMissingTemplates.length > 0
      ? `Missing template keys for: ${orderStatusMissingTemplates.join(", ")}.`
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  const cartRecoveryWarnings = [
    cartRecoverySettings.enabled && !cartRecoverySettings.templateKey
      ? "Template key is empty. Recovery sends will fail until a template key is added."
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  return (
    <s-page heading="Automations">
      <s-section heading="Manage automation foundations">
        <s-paragraph>
          Review live and draft-ready automation foundations, inspect recent activity, and safely update
          merchant-facing settings.
        </s-paragraph>
        <s-banner tone="info">
          Phase 1 assumption: utility sends (order confirmation/status) and marketing sends (cart recovery)
          require merchant-managed customer opt-in validation before enablement.
        </s-banner>

        <table>
          <thead>
            <tr>
              <th>Automation</th>
              <th>State</th>
              <th>Warnings</th>
              <th>Recent activity</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{automationLabels["order-confirmation"]}</td>
              <td>
                <span>{confirmationSettings.enabled ? "Published" : "Paused"}</span>
              </td>
              <td>{orderConfirmationWarnings.length}</td>
              <td>{recentConfirmations.length} recent events</td>
              <td>
                <a href="/app/automations?automation=order-confirmation">Manage</a>
              </td>
            </tr>
            <tr>
              <td>{automationLabels["order-status"]}</td>
              <td>
                <span>{orderStatusSettings.enabled ? "Published" : "Paused"}</span>
              </td>
              <td>{orderStatusWarnings.length}</td>
              <td>{recentStatusUpdates.length} recent events</td>
              <td>
                <a href="/app/automations?automation=order-status">Manage</a>
              </td>
            </tr>
            <tr>
              <td>{automationLabels["cart-recovery"]}</td>
              <td>
                <span>{cartRecoverySettings.enabled ? "Published" : "Paused"}</span>
              </td>
              <td>{cartRecoveryWarnings.length}</td>
              <td>{recentCartRecoveries.length} recent events</td>
              <td>
                <a href="/app/automations?automation=cart-recovery">Manage</a>
              </td>
            </tr>
          </tbody>
        </table>
      </s-section>

      {selectedAutomation === "order-confirmation" ? (
        <>
          <s-section heading="Order confirmation details">
            <s-paragraph>Send a confirmation after eligible order creation events.</s-paragraph>

            {orderConfirmationWarnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}

            <Form method="post">
              <input type="hidden" name="intent" value="save-order-confirmation-settings" />
              <s-stack direction="block" gap="base">
                <label>
                  <input
                    name="orderConfirmationEnabled"
                    type="checkbox"
                    defaultChecked={confirmationSettings.enabled}
                  />
                  Enable order confirmation
                </label>

                <label>
                  Template key
                  <input
                    name="orderConfirmationTemplateKey"
                    type="text"
                    defaultValue={confirmationSettings.templateKey}
                  />
                </label>

                <button type="submit">Save settings</button>
              </s-stack>
            </Form>

            {actionData?.saved === "order-confirmation" ? (
              actionData.blocked ? (
                <s-banner tone="critical">{actionData.message}</s-banner>
              ) : (
                <s-banner tone="success">Order confirmation settings saved.</s-banner>
              )
            ) : null}
          </s-section>

          <s-section heading="Recent order confirmation activity">
            {recentConfirmations.length === 0 ? (
              <s-banner tone="info">No order confirmation events have been processed yet.</s-banner>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConfirmations.map((item) => (
                    <tr key={item.id}>
                      <td>{item.orderId}</td>
                      <td>{item.status}</td>
                      <td>{item.statusReason ?? "-"}</td>
                      <td>{new Date(item.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </s-section>
        </>
      ) : null}

      {selectedAutomation === "order-status" ? (
        <>
          <s-section heading="Order status update details">
            <s-paragraph>Map templates to each status event so merchants can publish safely.</s-paragraph>

            {orderStatusWarnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}

            <Form method="post">
              <input type="hidden" name="intent" value="save-order-status-settings" />
              <s-stack direction="block" gap="base">
                <label>
                  <input
                    name="orderStatusUpdatesEnabled"
                    type="checkbox"
                    defaultChecked={orderStatusSettings.enabled}
                  />
                  Enable order status updates
                </label>

                <label>
                  Template key: partially fulfilled
                  <input
                    name="orderStatusTemplatePartialFulfilled"
                    type="text"
                    defaultValue={orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED}
                  />
                </label>

                <label>
                  Template key: fulfilled
                  <input
                    name="orderStatusTemplateFulfilled"
                    type="text"
                    defaultValue={orderStatusSettings.templateByStatus.ORDER_FULFILLED}
                  />
                </label>

                <label>
                  Template key: out for delivery
                  <input
                    name="orderStatusTemplateOutForDelivery"
                    type="text"
                    defaultValue={orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY}
                  />
                </label>

                <label>
                  Template key: delivered
                  <input
                    name="orderStatusTemplateDelivered"
                    type="text"
                    defaultValue={orderStatusSettings.templateByStatus.ORDER_DELIVERED}
                  />
                </label>

                <label>
                  Template key: cancelled
                  <input
                    name="orderStatusTemplateCancelled"
                    type="text"
                    defaultValue={orderStatusSettings.templateByStatus.ORDER_CANCELLED}
                  />
                </label>

                <button type="submit">Save settings</button>
              </s-stack>
            </Form>

            {actionData?.saved === "order-status" ? (
              actionData.blocked ? (
                <s-banner tone="critical">{actionData.message}</s-banner>
              ) : (
                <s-banner tone="success">Order status update settings saved.</s-banner>
              )
            ) : null}
          </s-section>

          <s-section heading="Recent order status activity">
            {recentStatusUpdates.length === 0 ? (
              <s-banner tone="info">No order status updates have been processed yet.</s-banner>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Status type</th>
                    <th>State</th>
                    <th>Reason</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentStatusUpdates.map((item) => (
                    <tr key={item.id}>
                      <td>{item.orderId}</td>
                      <td>{item.statusType}</td>
                      <td>{item.state}</td>
                      <td>{item.stateReason ?? "-"}</td>
                      <td>{new Date(item.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </s-section>
        </>
      ) : null}

      {selectedAutomation === "cart-recovery" ? (
        <>
          <s-section heading="Abandoned cart recovery details">
            <s-paragraph>
              Recovery candidates are captured from checkout updates and dispatched after the configured wait
              window.
            </s-paragraph>

            {cartRecoveryWarnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}

            <Form method="post">
              <input type="hidden" name="intent" value="save-cart-recovery-settings" />
              <s-stack direction="block" gap="base">
                <label>
                  <input
                    name="cartRecoveryEnabled"
                    type="checkbox"
                    defaultChecked={cartRecoverySettings.enabled}
                  />
                  Enable abandoned cart recovery
                </label>

                <label>
                  Template key: cart recovery
                  <input
                    name="cartRecoveryTemplateKey"
                    type="text"
                    defaultValue={cartRecoverySettings.templateKey}
                  />
                </label>

                <label>
                  Wait minutes before send
                  <input
                    name="cartRecoveryWaitMinutes"
                    type="number"
                    min={1}
                    max={10080}
                    defaultValue={cartRecoverySettings.waitMinutes}
                  />
                </label>

                <button type="submit">Save settings</button>
              </s-stack>
            </Form>

            {actionData?.saved === "cart-recovery" ? (
              actionData.blocked ? (
                <s-banner tone="critical">{actionData.message}</s-banner>
              ) : (
                <s-banner tone="success">Cart recovery settings saved.</s-banner>
              )
            ) : null}
          </s-section>

          <s-section heading="Recent cart recovery activity">
            {recentCartRecoveries.length === 0 ? (
              <s-banner tone="info">No cart recovery candidates have been captured yet.</s-banner>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Checkout ID</th>
                    <th>State</th>
                    <th>Reason</th>
                    <th>Recovered order</th>
                    <th>Recovered revenue</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCartRecoveries.map((item) => (
                    <tr key={item.id}>
                      <td>{item.checkoutId}</td>
                      <td>{item.state}</td>
                      <td>{item.stateReason ?? "-"}</td>
                      <td>{item.recoveredOrderNumber ?? item.recoveredOrderId ?? "-"}</td>
                      <td>
                        {item.recoveredRevenueAmount
                          ? `${item.recoveredRevenueAmount} ${item.recoveredCurrencyCode ?? ""}`.trim()
                          : "-"}
                      </td>
                      <td>{new Date(item.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </s-section>
        </>
      ) : null}
    </s-page>
  );
}
