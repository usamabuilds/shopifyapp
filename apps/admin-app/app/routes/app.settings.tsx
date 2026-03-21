import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import {
  getShopOverviewState,
  getShopSettings,
  parseSettingsFormData,
  upsertShopSettings,
} from "../models.shop.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, overview] = await Promise.all([
    getShopSettings(session.shop),
    getShopOverviewState(session.shop),
  ]);

  return { settings, overview };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  await upsertShopSettings(session.shop, parseSettingsFormData(formData));

  return { saved: true };
};

export default function SettingsPage() {
  const { settings, overview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const checklist = [
    {
      label: "Identity persistence",
      done: overview.onboarding.checklist.identityComplete,
      helpText: "Created automatically at install.",
    },
    {
      label: "Basic settings",
      done: overview.onboarding.checklist.settingsComplete,
      helpText: "Complete contact email, country, or timezone to mark this step done.",
    },
    {
      label: "Billing setup",
      done: overview.onboarding.checklist.billingComplete,
      helpText: "Reserved for a future billing flow foundation.",
    },
  ];

  return (
    <s-page heading="Onboarding & settings">
      <s-section heading="Setup checklist">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Current step: <strong>{overview.onboarding.currentStep}</strong>
          </s-paragraph>
          {checklist.map((item) => (
            <s-banner key={item.label} tone={item.done ? "success" : "info"}>
              <strong>{item.label}</strong>: {item.done ? "Complete" : "Pending"}. {item.helpText}
            </s-banner>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Store preferences">
        <s-paragraph>
          Save practical defaults used by your existing foundations. These values update setup progress and are safe to
          adjust anytime.
        </s-paragraph>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Contact email
              <input
                name="contactEmail"
                type="email"
                defaultValue={settings.contactEmail}
                placeholder="owner@store.com"
              />
            </label>
            <label>
              Default country
              <input name="defaultCountry" type="text" defaultValue={settings.defaultCountry} placeholder="US" />
            </label>
            <label>
              Timezone
              <input
                name="timezone"
                type="text"
                defaultValue={settings.timezone}
                placeholder="America/New_York"
              />
            </label>
            <button type="submit">Save settings</button>
          </s-stack>
        </Form>

        {actionData?.saved ? <s-banner tone="success">Settings saved and onboarding progress refreshed.</s-banner> : null}
      </s-section>

      <s-section heading="What to configure next">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            <Link to="/app/templates">Template keys</Link> for outgoing messages.
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/automations">Automation toggles</Link> for confirmation, status, and cart recovery.
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/campaigns">Campaign settings</Link> for dispatch behavior.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
