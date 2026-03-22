import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { getBroadcastCampaignSettings } from "../campaigns.broadcast.server";
import {
  getShopOverviewState,
  getShopSettings,
  parseSettingsFormData,
  upsertShopSettings,
} from "../models.shop.server";
import { authenticate } from "../shopify.server";

function nonEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, overview, campaignSettings] = await Promise.all([
    getShopSettings(session.shop),
    getShopOverviewState(session.shop),
    getBroadcastCampaignSettings(session.shop),
  ]);

  return {
    settings,
    overview,
    campaignSettings,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const currentSettings = await getShopSettings(session.shop);
  const parsed = parseSettingsFormData(formData);

  await upsertShopSettings(session.shop, parsed);

  const nextSettings = {
    contactEmail: parsed.contactEmail ?? "",
    defaultCountry: parsed.defaultCountry ?? "",
    timezone: parsed.timezone ?? "",
  };

  const changedFields = [
    { key: "contactEmail", label: "Contact email" },
    { key: "defaultCountry", label: "Default country" },
    { key: "timezone", label: "Timezone" },
  ].filter((field) => {
    const previousValue = nonEmpty(currentSettings[field.key as keyof typeof currentSettings]);
    const nextValue = nonEmpty(nextSettings[field.key as keyof typeof nextSettings]);
    return previousValue !== nextValue;
  });

  return {
    saved: true as const,
    savedAt: new Date().toISOString(),
    changedFields: changedFields.map((item) => item.label),
  };
};

export default function SettingsPage() {
  const { settings, overview, campaignSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const checklist = [
    {
      label: "Identity persistence",
      done: overview.onboarding.checklist.identityComplete,
      helpText: "Created automatically at install.",
    },
    {
      label: "Basic settings",
      done: overview.onboarding.checklist.settingsComplete,
      helpText: "Contact email, country, or timezone marks this step complete.",
    },
    {
      label: "Billing setup",
      done: overview.onboarding.checklist.billingComplete,
      helpText: "Reserved for existing billing foundation follow-up.",
    },
  ];

  const warnings = [
    !settings.contactEmail ? "Missing contact email: add one so support follow-up has an owner." : null,
    !settings.defaultCountry ? "Missing default country: some defaults may be ambiguous in reports and forms." : null,
    !settings.timezone ? "Missing timezone: scheduled actions may be harder to reason about." : null,
    !campaignSettings.enabled ? "Campaign dispatch is currently paused in campaign settings." : null,
  ].filter((item): item is string => Boolean(item));

  const loading = navigation.state === "submitting";

  return (
    <s-page heading="Settings">
      <s-section heading="Settings categories">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Use these categories to keep existing foundations configured safely. This page focuses on merchant profile
            and global defaults; other categories stay in their existing dedicated screens.
          </s-paragraph>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Purpose</th>
                <th>Where to edit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Merchant profile defaults</td>
                <td>Contact and locale defaults used across setup and operations.</td>
                <td>This page</td>
              </tr>
              <tr>
                <td>Template mapping</td>
                <td>Template keys and mapping visibility for sends.</td>
                <td>
                  <Link to="/app/templates">Templates</Link>
                </td>
              </tr>
              <tr>
                <td>Automation behavior</td>
                <td>Enable/disable and per-flow template mapping.</td>
                <td>
                  <Link to="/app/automations">Automations</Link>
                </td>
              </tr>
              <tr>
                <td>Campaign dispatch controls</td>
                <td>Broadcast defaults, throughput, and pause state.</td>
                <td>
                  <Link to="/app/campaigns">Campaigns</Link>
                </td>
              </tr>
              <tr>
                <td>Operational support tools</td>
                <td>Inspect intake, outbound state, failures, and traces.</td>
                <td>
                  <Link to="/app/support-tools">Support tools</Link>
                </td>
              </tr>
            </tbody>
          </table>
        </s-stack>
      </s-section>

      <s-section heading="Setup checklist and readiness">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Current setup step: <strong>{overview.onboarding.currentStep}</strong>
          </s-paragraph>
          {checklist.map((item) => (
            <s-banner key={item.label} tone={item.done ? "success" : "info"}>
              <strong>{item.label}</strong>: {item.done ? "Complete" : "Pending"}. {item.helpText}
            </s-banner>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Merchant profile defaults">
        <s-paragraph>
          Save practical defaults used by existing foundations. This write updates the same persistence as onboarding and
          remains safe to change anytime.
        </s-paragraph>

        {warnings.length > 0 ? (
          <s-stack direction="block" gap="small">
            {warnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}
          </s-stack>
        ) : (
          <s-banner tone="success">All merchant profile defaults are configured.</s-banner>
        )}

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
            <button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save merchant profile settings"}
            </button>
          </s-stack>
        </Form>

        {actionData?.saved ? (
          <s-banner tone="success">
            Settings saved at {new Date(actionData.savedAt).toLocaleString()}.{" "}
            {actionData.changedFields.length > 0
              ? `Updated: ${actionData.changedFields.join(", ")}.`
              : "No field values changed; onboarding state was refreshed."}
          </s-banner>
        ) : null}
      </s-section>

      <s-section heading="Merchant-safe guidance">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            If sends fail with missing templates, update template keys in Templates/Automations first, then verify
            processing in <Link to="/app/support-tools">Support tools</Link>.
          </s-paragraph>
          <s-paragraph>
            If campaigns are paused, switch campaign enablement back on from <Link to="/app/campaigns">Campaigns</Link>{" "}
            before scheduling new sends.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
