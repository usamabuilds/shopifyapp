import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import {
  getOrderConfirmationSettings,
  listRecentOrderConfirmations,
  parseOrderConfirmationSettingsForm,
  updateOrderConfirmationSettings,
} from "../automations.order-confirmation.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [settings, recentConfirmations] = await Promise.all([
    getOrderConfirmationSettings(session.shop),
    listRecentOrderConfirmations(session.shop),
  ]);

  return { settings, recentConfirmations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  await updateOrderConfirmationSettings(
    session.shop,
    parseOrderConfirmationSettingsForm(formData),
  );

  return { saved: true };
};

export default function AutomationsPage() {
  const { settings, recentConfirmations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Automations">
      <s-section heading="Order confirmation">
        <s-paragraph>
          Enable or disable order confirmation messaging. Other automation types are intentionally out of scope.
        </s-paragraph>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              <input
                name="orderConfirmationEnabled"
                type="checkbox"
                defaultChecked={settings.enabled}
              />
              Enable order confirmation
            </label>

            <label>
              Template key placeholder
              <input
                name="orderConfirmationTemplateKey"
                type="text"
                defaultValue={settings.templateKey}
              />
            </label>

            <button type="submit">Save automation settings</button>
          </s-stack>
        </Form>

        {actionData?.saved ? <s-banner tone="success">Automation settings saved.</s-banner> : null}
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
    </s-page>
  );
}
