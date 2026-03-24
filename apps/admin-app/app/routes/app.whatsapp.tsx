import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { getShopOverviewState } from "../models.shop.server";
import { authenticate } from "../shopify.server";
import {
  getMerchantWhatsappConnectionState,
  parseMerchantWhatsappConnectionFormData,
  upsertMerchantWhatsappConnection,
  type MerchantWhatsappConnectionStatus,
  type MerchantWhatsappSyncStatus,
} from "../whatsapp-connection.server";

const CONNECTION_STATUS_LABELS: Record<MerchantWhatsappConnectionStatus, string> = {
  NOT_CONNECTED: "Not connected",
  INCOMPLETE_SETUP: "Incomplete setup",
  MISCONFIGURED: "Misconfigured",
  SYNC_NEEDED: "Sync needed",
  CONNECTED: "Connected",
};

const SYNC_STATUS_LABELS: Record<MerchantWhatsappSyncStatus, string> = {
  NOT_STARTED: "Not started",
  PENDING: "Pending",
  IN_SYNC: "In sync",
  NEEDS_ATTENTION: "Needs attention",
  FAILED: "Failed",
};

function connectionTone(status: MerchantWhatsappConnectionStatus): "success" | "info" | "warning" | "critical" {
  if (status === "CONNECTED") {
    return "success";
  }

  if (status === "NOT_CONNECTED") {
    return "info";
  }

  if (status === "SYNC_NEEDED" || status === "INCOMPLETE_SETUP") {
    return "warning";
  }

  return "critical";
}

function syncTone(status: MerchantWhatsappSyncStatus): "success" | "info" | "warning" | "critical" {
  if (status === "IN_SYNC") {
    return "success";
  }

  if (status === "NOT_STARTED") {
    return "info";
  }

  if (status === "PENDING") {
    return "warning";
  }

  return "critical";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [connection, overview] = await Promise.all([
    getMerchantWhatsappConnectionState(session.shop),
    getShopOverviewState(session.shop),
  ]);

  return {
    connection,
    overview,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const parsed = parseMerchantWhatsappConnectionFormData(formData);
  const updated = await upsertMerchantWhatsappConnection(session.shop, parsed);

  return {
    saved: true as const,
    savedAt: new Date().toISOString(),
    connectionStatus: updated.connectionStatus,
    syncStatus: updated.syncStatus,
  };
};

export default function WhatsappConnectionPage() {
  const { connection, overview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const readinessWarnings = [
    !overview.onboarding.readiness.whatsappConnected
      ? "WhatsApp is not yet marked ready. Complete connection identifiers and resolve configuration issues."
      : null,
    !overview.onboarding.readiness.templatesReady
      ? "Template sync is not ready. Request sync or set sync status to In sync once templates are available."
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <s-page heading="WhatsApp connection">
      <s-section heading="Connection readiness">
        <s-stack direction="block" gap="small">
          <s-banner tone={connectionTone(connection.connectionStatus)}>
            Connection state: <strong>{CONNECTION_STATUS_LABELS[connection.connectionStatus]}</strong>
          </s-banner>
          <s-banner tone={syncTone(connection.syncStatus)}>
            Template sync state: <strong>{SYNC_STATUS_LABELS[connection.syncStatus]}</strong>
          </s-banner>
          <s-paragraph>
            Onboarding step: <strong>{overview.onboarding.currentStep}</strong>
          </s-paragraph>
          <s-paragraph>
            Last template sync: {connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}
          </s-paragraph>
          <s-paragraph>
            Last updated: {connection.updatedAt ? new Date(connection.updatedAt).toLocaleString() : "Not yet saved"}
          </s-paragraph>
          <s-stack direction="inline" gap="small">
            <Link to="/app/templates">Open templates</Link>
            <Link to="/app/settings">Open settings</Link>
            <Link to="/app/support-tools">Open support tools</Link>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Merchant setup and persistence">
        <s-paragraph>
          Save business identifiers and setup state for WhatsApp Cloud API onboarding. This updates onboarding readiness
          flags and preserves your current Shopify auth/session behavior.
        </s-paragraph>

        {readinessWarnings.length > 0 ? (
          <s-stack direction="block" gap="small">
            {readinessWarnings.map((item) => (
              <s-banner key={item} tone="warning">
                {item}
              </s-banner>
            ))}
          </s-stack>
        ) : (
          <s-banner tone="success">WhatsApp connection and template sync are both marked ready.</s-banner>
        )}

        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Business account ID
              <input name="businessAccountId" type="text" defaultValue={connection.businessAccountId} placeholder="1234567890" />
            </label>
            <label>
              Phone number ID
              <input name="phoneNumberId" type="text" defaultValue={connection.phoneNumberId} placeholder="10987654321" />
            </label>
            <label>
              Display phone number
              <input name="displayPhoneNumber" type="text" defaultValue={connection.displayPhoneNumber} placeholder="+1 555-0100" />
            </label>
            <label>
              Sync status
              <select name="syncStatus" defaultValue={connection.syncStatus}>
                <option value="NOT_STARTED">Not started</option>
                <option value="PENDING">Pending</option>
                <option value="IN_SYNC">In sync</option>
                <option value="NEEDS_ATTENTION">Needs attention</option>
                <option value="FAILED">Failed</option>
              </select>
            </label>
            <label>
              Configuration notes
              <textarea
                name="configurationNotes"
                defaultValue={connection.configurationNotes}
                placeholder="Internal setup notes for operator/support visibility"
                rows={3}
              />
            </label>
            <label>
              Error state
              <textarea
                name="errorState"
                defaultValue={connection.errorState}
                placeholder="Store any current integration error or leave blank"
                rows={3}
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="templateSyncRequested"
                defaultChecked={connection.templateSyncRequested}
              />{" "}
              Template sync requested
            </label>
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save WhatsApp connection"}
            </button>
          </s-stack>
        </Form>

        {actionData?.saved ? (
          <s-banner tone="success">
            Saved at {new Date(actionData.savedAt).toLocaleString()}. Connection is now{" "}
            <strong>{CONNECTION_STATUS_LABELS[actionData.connectionStatus]}</strong> and sync is{" "}
            <strong>{SYNC_STATUS_LABELS[actionData.syncStatus]}</strong>.
          </s-banner>
        ) : null}
      </s-section>

      <s-section heading="Operator/support visibility">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Use configuration notes and error state to preserve current onboarding blockers for merchant and operator
            handoff without introducing inbox/chat scope.
          </s-paragraph>
          <s-banner tone="info">
            If sync remains pending/failed, keep this page updated and use <Link to="/app/support-tools">Support tools</Link>{" "}
            to inspect downstream failures.
          </s-banner>
        </s-stack>
      </s-section>
    </s-page>
  );
}
