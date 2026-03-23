import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { authenticate } from "../shopify.server";
import { getSupportToolsSnapshot, runSupportRecoveryAction } from "../support-tools.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const snapshot = await getSupportToolsSnapshot(session.shop);

  return snapshot;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("supportAction");

  if (actionType !== "dispatch-cart-recovery" && actionType !== "dispatch-campaigns") {
    return {
      ok: false as const,
      message: "Unsupported support action. No changes were made.",
    };
  }

  const result = await runSupportRecoveryAction({
    shopDomain: session.shop,
    action: actionType,
  });

  return {
    ok: true as const,
    message: result.summary,
  };
};

export default function SupportToolsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <s-page heading="Support tools">
      <s-section heading="How to use this page">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            This page is for operator and support review of existing foundations. Use it to inspect webhook intake,
            outbound state, recent failures, and end-to-end trace links.
          </s-paragraph>
          <s-banner tone="info">
            Merchant-safe guidance: if a failure reason references missing templates or disabled features, update
            <Link to="/app/settings"> settings</Link>, then re-run only the relevant recovery action.
          </s-banner>
          <s-banner tone="warning">
            Phase 1 limitation: recipient opt-in is not programmatically enforced per contact yet. Operators should
            verify consent scope before triggering retries or dispatch actions.
          </s-banner>
          {isLoading ? <s-banner tone="info">Refreshing support data…</s-banner> : null}
          {actionData ? (
            <s-banner tone={actionData.ok ? "success" : "warning"}>{actionData.message}</s-banner>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Recovery actions">
        <s-paragraph>
          These actions are scoped to existing dispatch foundations only. They do not create new product behavior.
        </s-paragraph>
        <s-stack direction="inline" gap="small">
          <Form method="post">
            <input type="hidden" name="supportAction" value="dispatch-cart-recovery" />
            <button type="submit">Run due cart recovery dispatch</button>
          </Form>
          <Form method="post">
            <input type="hidden" name="supportAction" value="dispatch-campaigns" />
            <button type="submit">Run due campaign dispatch</button>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Webhook intake state">
        {data.recentWebhooks.length === 0 ? (
          <s-banner tone="info">No webhook events found yet for this shop.</s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Topic</th>
                <th>Processing status</th>
                <th>Queue status</th>
                <th>Attempts</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {data.recentWebhooks.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.receivedAt).toLocaleString()}</td>
                  <td>{item.topic}</td>
                  <td>{item.processingStatus}</td>
                  <td>{item.queueItem?.status ?? "-"}</td>
                  <td>{item.queueItem?.attempts ?? 0}</td>
                  <td>{item.queueItem?.lastError ?? item.failureReason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading="Outbound message state">
        {data.recentOutboundMessages.length === 0 ? (
          <s-banner tone="info">No outbound messages recorded yet.</s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Use case</th>
                <th>Status</th>
                <th>Retry</th>
                <th>Provider</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOutboundMessages.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{item.useCase}</td>
                  <td>{item.status}</td>
                  <td>
                    {item.retryCount}/{item.maxRetryCount}
                  </td>
                  <td>{item.providerName}</td>
                  <td>{item.statusReason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading="Recent failures and next actions">
        {data.failures.length === 0 ? (
          <s-banner tone="success">
            No recent failed or dead-letter items detected in webhook or outbound state.
          </s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Area</th>
                <th>State</th>
                <th>Failure reason</th>
                <th>Recommended next action</th>
              </tr>
            </thead>
            <tbody>
              {data.failures.map((item) => (
                <tr key={`${item.area}-${item.id}`}>
                  <td>{new Date(item.occurredAt).toLocaleString()}</td>
                  <td>{item.area}</td>
                  <td>{item.state}</td>
                  <td>{item.reason}</td>
                  <td>{item.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading="Traceability: event → action → message">
        {data.traces.length === 0 ? (
          <s-banner tone="info">
            No trace records yet. Once webhook events trigger automations, links between event, action, and outbound
            message will appear here.
          </s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Entity</th>
                <th>Webhook event id</th>
                <th>Action state</th>
                <th>Outbound message id</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.traces.map((item) => (
                <tr key={`${item.area}-${item.id}`}>
                  <td>{item.area}</td>
                  <td>{item.entityReference}</td>
                  <td>{item.webhookEventId}</td>
                  <td>{item.actionState}</td>
                  <td>{item.outboundMessageId ?? "-"}</td>
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
