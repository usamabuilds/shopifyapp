import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import {
  getShopSettings,
  parseSettingsFormData,
  upsertShopSettings,
} from "../models.shop.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);

  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  await upsertShopSettings(session.shop, parseSettingsFormData(formData));

  return { saved: true };
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Settings">
      <s-section>
        <s-paragraph>
          Save basic shop preferences. This is a foundation for future setup
          steps.
        </s-paragraph>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Contact email
              <input name="contactEmail" type="email" defaultValue={settings.contactEmail} />
            </label>
            <label>
              Default country
              <input name="defaultCountry" type="text" defaultValue={settings.defaultCountry} />
            </label>
            <label>
              Timezone
              <input name="timezone" type="text" defaultValue={settings.timezone} />
            </label>
            <button type="submit">Save settings</button>
          </s-stack>
        </Form>

        {actionData?.saved ? (
          <s-banner tone="success">Settings saved.</s-banner>
        ) : null}
      </s-section>
    </s-page>
  );
}
