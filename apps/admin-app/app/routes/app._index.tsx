import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { listRecentCartRecoveries } from "../automations.cart-recovery.server";
import { listRecentOrderConfirmations } from "../automations.order-confirmation.server";
import { listRecentOrderStatusUpdates } from "../automations.order-status-updates.server";
import { listBroadcastCampaigns } from "../campaigns.broadcast.server";
import { getShopOverviewState } from "../models.shop.server";
import { authenticate } from "../shopify.server";
import { listWorkflows } from "../workflows.builder.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [overview, recentConfirmations, recentStatusUpdates, recentCartRecoveries, campaigns, workflows] =
    await Promise.all([
      getShopOverviewState(session.shop),
      listRecentOrderConfirmations(session.shop, 10),
      listRecentOrderStatusUpdates(session.shop, 10),
      listRecentCartRecoveries(session.shop, 10),
      listBroadcastCampaigns(session.shop),
      listWorkflows(session.shop),
    ]);

  const readinessItems = [
    { label: "Settings configured", value: overview.onboarding.readiness.settingsConfigured },
    { label: "WhatsApp connected", value: overview.onboarding.readiness.whatsappConnected },
    { label: "Templates ready", value: overview.onboarding.readiness.templatesReady },
    { label: "Automations ready", value: overview.onboarding.readiness.automationsReady },
  ];

  const checklistItems = [
    { label: "Identity persistence", value: overview.onboarding.checklist.identityComplete },
    { label: "Basic settings", value: overview.onboarding.checklist.settingsComplete },
    { label: "Billing setup", value: overview.onboarding.checklist.billingComplete },
  ];

  const completeChecklistCount = checklistItems.filter((item) => item.value).length;
  const completeReadinessCount = readinessItems.filter((item) => item.value).length;

  const recentActivity = [
    ...recentConfirmations.slice(0, 3).map((item) => ({
      id: item.id,
      area: "Order confirmation",
      status: item.status,
      updatedAt: item.updatedAt,
      detail: `Order ${item.orderId}`,
    })),
    ...recentStatusUpdates.slice(0, 3).map((item) => ({
      id: item.id,
      area: "Order status",
      status: item.state,
      updatedAt: item.updatedAt,
      detail: `Order ${item.orderId}`,
    })),
    ...recentCartRecoveries.slice(0, 3).map((item) => ({
      id: item.id,
      area: "Cart recovery",
      status: item.state,
      updatedAt: item.updatedAt,
      detail: `Checkout ${item.checkoutId}`,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);

  return {
    overview,
    checklistItems,
    readinessItems,
    completion: {
      checklist: `${completeChecklistCount}/${checklistItems.length}`,
      readiness: `${completeReadinessCount}/${readinessItems.length}`,
      percent: Math.round(((completeChecklistCount + completeReadinessCount) / (checklistItems.length + readinessItems.length)) * 100),
    },
    connectedFoundations: {
      workflows: workflows.length,
      campaigns: campaigns.length,
      activeWorkflows: workflows.filter((item) => item.status === "PUBLISHED").length,
      liveCampaigns: campaigns.filter((item) => item.status === "SCHEDULED" || item.status === "QUEUED").length,
    },
    operationsSummary: {
      confirmations: recentConfirmations.length,
      statusUpdates: recentStatusUpdates.length,
      cartRecoveries: recentCartRecoveries.length,
      recentActivity,
    },
  };
};

function badgeTone(complete: boolean) {
  return complete ? "success" : "critical";
}

export default function OverviewPage() {
  const { overview, checklistItems, readinessItems, completion, connectedFoundations, operationsSummary } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <s-page heading="Merchant dashboard">
      <s-section heading="Setup progress">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            <strong>{completion.percent}% complete</strong> across onboarding and readiness checks.
          </s-paragraph>
          <s-paragraph>Checklist completed: {completion.checklist}</s-paragraph>
          <s-paragraph>Foundations ready: {completion.readiness}</s-paragraph>
          <s-paragraph>
            Current setup step: <strong>{overview.onboarding.currentStep}</strong>
          </s-paragraph>
          {!overview.onboarding.readiness.whatsappConnected ? (
            <s-banner tone="warning">
              WhatsApp connection is required before production usage. Complete it in <Link to="/app/whatsapp">WhatsApp connection</Link>.
            </s-banner>
          ) : null}
          <s-paragraph>
            Shop: <strong>{overview.shopDomain}</strong> · Installed: {new Date(overview.installedAt).toLocaleDateString()}
          </s-paragraph>
          <s-stack direction="inline" gap="small">
            <Link to="/app/whatsapp">Connect WhatsApp</Link>
            <Link to="/app/settings">Continue onboarding</Link>
            <Link to="/app/automations">Review automations</Link>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Onboarding checklist">
        <s-stack direction="block" gap="small">
          {checklistItems.map((item) => (
            <s-banner key={item.label} tone={badgeTone(item.value)}>
              {item.label}: {item.value ? "Complete" : "Pending"}
            </s-banner>
          ))}
          {readinessItems.map((item) => (
            <s-banner key={item.label} tone={badgeTone(item.value)}>
              {item.label}: {item.value ? "Ready" : "Needs setup"}
            </s-banner>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Connected/configured foundations">
        <s-stack direction="block" gap="small">
          <s-paragraph>Total workflows configured: {connectedFoundations.workflows}</s-paragraph>
          <s-paragraph>Published workflows: {connectedFoundations.activeWorkflows}</s-paragraph>
          <s-paragraph>Total campaigns created: {connectedFoundations.campaigns}</s-paragraph>
          <s-paragraph>Campaigns queued/scheduled: {connectedFoundations.liveCampaigns}</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Recent operational activity">
        {isLoading ? (
          <s-banner tone="info">Refreshing dashboard activity…</s-banner>
        ) : operationsSummary.recentActivity.length === 0 ? (
          <s-banner tone="info">
            No recent operational activity yet. Once events are processed, you will see confirmations, status updates,
            and cart recovery activity here.
          </s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Status</th>
                <th>Detail</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {operationsSummary.recentActivity.map((item) => (
                <tr key={`${item.area}-${item.id}`}>
                  <td>{item.area}</td>
                  <td>{item.status}</td>
                  <td>{item.detail}</td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading="Quick actions">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            <Link to="/app/whatsapp">Connect/configure WhatsApp foundation</Link>
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/settings">Update onboarding and shop settings</Link>
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/templates">Review templates foundation</Link>
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/campaigns">Create or schedule a campaign</Link>
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/workflows">Create or publish workflows</Link>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
