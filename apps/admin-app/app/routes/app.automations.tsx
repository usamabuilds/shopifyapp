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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

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

  return {
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
    await updateOrderStatusUpdateSettings(
      session.shop,
      parseOrderStatusUpdateSettingsForm(formData),
    );

    return { saved: "order-status" as const };
  }

  if (intent === "save-cart-recovery-settings") {
    await updateCartRecoverySettings(
      session.shop,
      parseCartRecoverySettingsForm(formData),
    );

    return { saved: "cart-recovery" as const };
  }

  await updateOrderConfirmationSettings(
    session.shop,
    parseOrderConfirmationSettingsForm(formData),
  );

  return { saved: "order-confirmation" as const };
};

export default function AutomationsPage() {
  const {
    confirmationSettings,
    recentConfirmations,
    orderStatusSettings,
    recentStatusUpdates,
    cartRecoverySettings,
    recentCartRecoveries,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Automations">
      <s-section heading="Order confirmation">
        <s-paragraph>
          Enable or disable order confirmation messaging. Other automation types are intentionally out of scope.
        </s-paragraph>

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
              Template key placeholder
              <input
                name="orderConfirmationTemplateKey"
                type="text"
                defaultValue={confirmationSettings.templateKey}
              />
            </label>

            <button type="submit">Save automation settings</button>
          </s-stack>
        </Form>

        {actionData?.saved === "order-confirmation" ? (
          <s-banner tone="success">Order confirmation settings saved.</s-banner>
        ) : null}
      </s-section>

      <s-section heading="Recent order confirmations">
        {recentConfirmations.length === 0 ? (
          <s-paragraph>No order confirmation events have been processed yet.</s-paragraph>
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

      <s-section heading="Order status updates">
        <s-paragraph>
          Configure template keys for explicit order and fulfillment status events.
        </s-paragraph>

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

            <button type="submit">Save order status settings</button>
          </s-stack>
        </Form>

        {actionData?.saved === "order-status" ? (
          <s-banner tone="success">Order status update settings saved.</s-banner>
        ) : null}
      </s-section>

      <s-section heading="Recent order status updates">
        {recentStatusUpdates.length === 0 ? (
          <s-paragraph>No order status updates have been processed yet.</s-paragraph>
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

      <s-section heading="Abandoned cart recovery">
        <s-paragraph>
          Foundation flow using checkout update signals. A candidate is captured, delayed by a wait window, then
          dispatched through the existing outbound layer.
        </s-paragraph>

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

            <button type="submit">Save cart recovery settings</button>
          </s-stack>
        </Form>

        {actionData?.saved === "cart-recovery" ? (
          <s-banner tone="success">Cart recovery settings saved.</s-banner>
        ) : null}
      </s-section>

      <s-section heading="Recent cart recovery attempts">
        {recentCartRecoveries.length === 0 ? (
          <s-paragraph>No cart recovery candidates have been captured yet.</s-paragraph>
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
    </s-page>
  );
}
