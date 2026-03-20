import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

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
  ] = await Promise.all([
    getOrderConfirmationSettings(session.shop),
    listRecentOrderConfirmations(session.shop),
    getOrderStatusUpdateSettings(session.shop),
    listRecentOrderStatusUpdates(session.shop),
  ]);

  return {
    confirmationSettings,
    recentConfirmations,
    orderStatusSettings,
    recentStatusUpdates,
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
    </s-page>
  );
}
