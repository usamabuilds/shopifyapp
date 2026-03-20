import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getShopOverviewState } from "../models.shop.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const overview = await getShopOverviewState(session.shop);

  return { overview };
};

function statusLabel(complete: boolean) {
  return complete ? "Complete" : "Pending";
}

export default function OverviewPage() {
  const { overview } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Overview">
      <s-section heading="Onboarding status">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Shop: <strong>{overview.shopDomain}</strong>
          </s-paragraph>
          <s-paragraph>
            Install recorded: {new Date(overview.installedAt).toLocaleDateString()}
          </s-paragraph>
          <s-paragraph>Current step: {overview.onboarding.currentStep}</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Checklist">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Identity persistence: {statusLabel(overview.onboarding.checklist.identityComplete)}
          </s-paragraph>
          <s-paragraph>
            Basic settings: {statusLabel(overview.onboarding.checklist.settingsComplete)}
          </s-paragraph>
          <s-paragraph>
            Billing setup: {statusLabel(overview.onboarding.checklist.billingComplete)}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Readiness flags">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Settings configured: {statusLabel(overview.onboarding.readiness.settingsConfigured)}
          </s-paragraph>
          <s-paragraph>
            WhatsApp connected: {statusLabel(overview.onboarding.readiness.whatsappConnected)}
          </s-paragraph>
          <s-paragraph>
            Templates ready: {statusLabel(overview.onboarding.readiness.templatesReady)}
          </s-paragraph>
          <s-paragraph>
            Automations ready: {statusLabel(overview.onboarding.readiness.automationsReady)}
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
