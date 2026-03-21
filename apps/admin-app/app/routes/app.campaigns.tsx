import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import {
  createBroadcastCampaign,
  dispatchDueBroadcastCampaigns,
  getBroadcastCampaignSettings,
  listBroadcastCampaignLogs,
  listBroadcastCampaigns,
  parseCampaignSettingsForm,
  parseCreateCampaignForm,
  queueBroadcastCampaign,
  updateBroadcastCampaignSettings,
} from "../campaigns.broadcast.server";
import { authenticate } from "../shopify.server";

function formatDateTime(value: Date | string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function toDateTimeLocalValue(value: Date | string | null): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedCampaignId = url.searchParams.get("campaignId");

  await dispatchDueBroadcastCampaigns({
    shopDomain: session.shop,
    limitCampaigns: 3,
  });

  const [settings, campaigns, logs] = await Promise.all([
    getBroadcastCampaignSettings(session.shop),
    listBroadcastCampaigns(session.shop),
    listBroadcastCampaignLogs(session.shop),
  ]);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null;

  const selectedCampaignLogs = selectedCampaign
    ? logs.filter((log) => log.campaignId === selectedCampaign.id).slice(0, 20)
    : [];

  return {
    settings,
    campaigns,
    logs,
    selectedCampaign,
    selectedCampaignLogs,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-campaign-settings") {
    await updateBroadcastCampaignSettings(
      session.shop,
      parseCampaignSettingsForm(formData),
    );

    return { saved: "settings" as const };
  }

  if (intent === "create-campaign-draft") {
    const input = parseCreateCampaignForm(formData);

    await createBroadcastCampaign({
      shopDomain: session.shop,
      input,
      mode: "draft",
    });

    return { saved: "campaign-draft" as const };
  }

  if (intent === "create-campaign-schedule") {
    const input = parseCreateCampaignForm(formData);

    await createBroadcastCampaign({
      shopDomain: session.shop,
      input,
      mode: "schedule",
    });

    return { saved: "campaign-scheduled" as const };
  }

  if (intent === "queue-campaign-send-now") {
    const campaignId = formData.get("campaignId");

    if (typeof campaignId === "string" && campaignId.length > 0) {
      await queueBroadcastCampaign({
        campaignId,
        shopDomain: session.shop,
        mode: "send-now",
      });

      await dispatchDueBroadcastCampaigns({
        shopDomain: session.shop,
        limitCampaigns: 1,
      });
    }

    return { saved: "campaign-send-now" as const };
  }

  if (intent === "queue-campaign-schedule") {
    const campaignId = formData.get("campaignId");
    const scheduleAt = formData.get("scheduleAt");
    const parsedScheduleAt =
      typeof scheduleAt === "string" && scheduleAt.length > 0 ? new Date(scheduleAt) : null;

    if (typeof campaignId === "string" && campaignId.length > 0) {
      await queueBroadcastCampaign({
        campaignId,
        shopDomain: session.shop,
        mode: "schedule",
        scheduleAt:
          parsedScheduleAt && !Number.isNaN(parsedScheduleAt.getTime()) ? parsedScheduleAt : null,
      });
    }

    return { saved: "campaign-rescheduled" as const };
  }

  if (intent === "duplicate-campaign-draft") {
    const input = parseCreateCampaignForm(formData);

    await createBroadcastCampaign({
      shopDomain: session.shop,
      input: {
        ...input,
        name: `${input.name} (Copy)`,
      },
      mode: "draft",
    });

    return { saved: "campaign-duplicated" as const };
  }

  const input = parseCreateCampaignForm(formData);

  await createBroadcastCampaign({
    shopDomain: session.shop,
    input,
    mode: "send-now",
  });

  await dispatchDueBroadcastCampaigns({
    shopDomain: session.shop,
    limitCampaigns: 1,
  });

  return { saved: "campaign-send-now" as const };
};

export default function CampaignsPage() {
  const { settings, campaigns, logs, selectedCampaign, selectedCampaignLogs } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const selectedCampaignWarnings: string[] = selectedCampaign
    ? [
        selectedCampaign.status === "FAILED" && selectedCampaign.statusReason
          ? selectedCampaign.statusReason
          : null,
        selectedCampaign.status === "DRAFT" && !selectedCampaign.templateKey && !settings.defaultTemplateKey
          ? "No template key on this draft or in campaign defaults."
          : null,
        selectedCampaign.audienceType === "MANUAL_CONTACTS" && selectedCampaign.totalRecipients === 0
          ? "Manual audience currently resolves to zero recipients."
          : null,
      ].filter((warning): warning is string => Boolean(warning))
    : [];

  return (
    <s-page heading="Campaigns">
      <s-section heading="Broadcast campaign settings">
        <s-paragraph>
          Configure queue behavior and defaults. Existing persisted campaigns remain manageable below.
        </s-paragraph>

        {!settings.enabled ? (
          <s-banner tone="warning">
            Campaign dispatch is currently paused at the merchant level. Draft and scheduled campaigns will not send.
          </s-banner>
        ) : null}

        <Form method="post">
          <input type="hidden" name="intent" value="save-campaign-settings" />
          <s-stack direction="block" gap="base">
            <label>
              <input name="campaignEnabled" type="checkbox" defaultChecked={settings.enabled} />
              Enable broadcast campaigns
            </label>

            <label>
              Default template key
              <input name="campaignTemplateKey" type="text" defaultValue={settings.defaultTemplateKey} />
            </label>

            <label>
              Dispatch batch size
              <input
                name="campaignDispatchBatchSize"
                type="number"
                min={1}
                max={200}
                defaultValue={settings.dispatchBatchSize}
              />
            </label>

            <label>
              Throttle milliseconds between sends
              <input
                name="campaignThrottleMs"
                type="number"
                min={0}
                max={60000}
                defaultValue={settings.throttleMsBetweenMessages}
              />
            </label>

            <button type="submit">Save campaign settings</button>
          </s-stack>
        </Form>

        {actionData?.saved === "settings" ? (
          <s-banner tone="success">Campaign settings saved.</s-banner>
        ) : null}
      </s-section>

      <s-section heading="Create broadcast campaign">
        <s-paragraph>
          Create a draft, schedule for later, or queue a send now campaign using the existing persistence model.
        </s-paragraph>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Campaign name
              <input name="name" type="text" required />
            </label>

            <label>
              Message body
              <textarea name="messageBody" rows={5} required />
            </label>

            <label>
              Template key override (optional)
              <input name="templateKey" type="text" defaultValue={settings.defaultTemplateKey} />
            </label>

            <label>
              Audience
              <select name="audienceType" defaultValue="ALL_KNOWN_CONTACTS">
                <option value="ALL_KNOWN_CONTACTS">All known contacts</option>
                <option value="RECENT_ORDER_CONTACTS">Recent order contacts (last 30 days)</option>
                <option value="MANUAL_CONTACTS">Manual contacts (comma/newline separated)</option>
              </select>
            </label>

            <label>
              Manual recipients (used when manual audience is selected)
              <textarea name="manualRecipients" rows={4} placeholder="+15550001111, +15550002222" />
            </label>

            <label>
              Schedule at (optional)
              <input name="scheduleAt" type="datetime-local" />
            </label>

            <s-stack direction="inline" gap="base">
              <button type="submit" name="intent" value="create-campaign-draft">
                Save draft
              </button>
              <button type="submit" name="intent" value="create-campaign-schedule">
                Save and schedule
              </button>
              <button type="submit" name="intent" value="create-campaign-send-now">
                Send now
              </button>
            </s-stack>
          </s-stack>
        </Form>

        {actionData?.saved === "campaign-draft" ? (
          <s-banner tone="success">Campaign draft saved.</s-banner>
        ) : null}
        {actionData?.saved === "campaign-scheduled" ? (
          <s-banner tone="success">Campaign scheduled.</s-banner>
        ) : null}
        {actionData?.saved === "campaign-send-now" ? (
          <s-banner tone="success">Campaign queued for send now.</s-banner>
        ) : null}
        {actionData?.saved === "campaign-rescheduled" ? (
          <s-banner tone="success">Campaign schedule updated.</s-banner>
        ) : null}
        {actionData?.saved === "campaign-duplicated" ? (
          <s-banner tone="success">Campaign duplicated as draft.</s-banner>
        ) : null}
      </s-section>

      <s-section heading="Campaign list">
        {campaigns.length === 0 ? (
          <s-banner tone="info">No campaigns created yet. Create a draft to get started.</s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Audience</th>
                <th>Recipients</th>
                <th>Sent</th>
                <th>Failed</th>
                <th>Schedule</th>
                <th>Updated</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.name}</td>
                  <td>{campaign.status}</td>
                  <td>{campaign.audienceType}</td>
                  <td>{campaign.totalRecipients}</td>
                  <td>{campaign.sentRecipients}</td>
                  <td>{campaign.failedRecipients}</td>
                  <td>{formatDateTime(campaign.scheduleAt)}</td>
                  <td>{formatDateTime(campaign.updatedAt)}</td>
                  <td>
                    <a href={`/app/campaigns?campaignId=${campaign.id}`}>Manage</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      {selectedCampaign ? (
        <>
          <s-section heading={`Campaign details: ${selectedCampaign.name}`}>
            <s-stack direction="block" gap="base">
              <s-paragraph>Current state: {selectedCampaign.status}</s-paragraph>
              <s-paragraph>Status reason: {selectedCampaign.statusReason ?? "-"}</s-paragraph>
              <s-paragraph>Created: {formatDateTime(selectedCampaign.createdAt)}</s-paragraph>
              <s-paragraph>Last updated: {formatDateTime(selectedCampaign.updatedAt)}</s-paragraph>
              <s-paragraph>Scheduled for: {formatDateTime(selectedCampaign.scheduleAt)}</s-paragraph>
            </s-stack>

            {selectedCampaignWarnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}

            <s-stack direction="inline" gap="base">
              <Form method="post">
                <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                <button type="submit" name="intent" value="queue-campaign-send-now">
                  Queue send now
                </button>
              </Form>

              <Form method="post">
                <input type="hidden" name="intent" value="queue-campaign-schedule" />
                <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                <input
                  name="scheduleAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocalValue(selectedCampaign.scheduleAt)}
                />
                <button type="submit">Save schedule</button>
              </Form>
            </s-stack>

            <details>
              <summary>Duplicate this campaign as draft</summary>
              <Form method="post">
                <input type="hidden" name="intent" value="duplicate-campaign-draft" />
                <input type="hidden" name="name" value={selectedCampaign.name} />
                <input type="hidden" name="messageBody" value={selectedCampaign.messageBody} />
                <input type="hidden" name="templateKey" value={selectedCampaign.templateKey ?? ""} />
                <input type="hidden" name="audienceType" value={selectedCampaign.audienceType} />
                <input type="hidden" name="scheduleAt" value="" />
                <input type="hidden" name="manualRecipients" value="" />
                <button type="submit">Create draft copy</button>
              </Form>
            </details>
          </s-section>

          <s-section heading="Recent campaign activity">
            {selectedCampaignLogs.length === 0 ? (
              <s-banner tone="info">No activity logs for this campaign yet.</s-banner>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Level</th>
                    <th>Event</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCampaignLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.createdAt)}</td>
                      <td>{log.level}</td>
                      <td>{log.eventType}</td>
                      <td>{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </s-section>
        </>
      ) : null}

      <s-section heading="Global campaign dispatch logs">
        {logs.length === 0 ? (
          <s-banner tone="info">No campaign logs yet.</s-banner>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Level</th>
                <th>Event</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.level}</td>
                  <td>{log.eventType}</td>
                  <td>{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>
    </s-page>
  );
}
