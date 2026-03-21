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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  await dispatchDueBroadcastCampaigns({
    shopDomain: session.shop,
    limitCampaigns: 3,
  });

  const [settings, campaigns, logs] = await Promise.all([
    getBroadcastCampaignSettings(session.shop),
    listBroadcastCampaigns(session.shop),
    listBroadcastCampaignLogs(session.shop),
  ]);

  return {
    settings,
    campaigns,
    logs,
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
  const { settings, campaigns, logs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Campaigns">
      <s-section heading="Broadcast campaign settings">
        <s-paragraph>
          Basic broadcast controls for campaign queue processing. This first version uses a pragmatic audience model and
          placeholder outbound provider dispatch behavior.
        </s-paragraph>

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
          Audience foundation options: all known contacts, recent order contacts (30 days), or manual contacts.
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
      </s-section>

      <s-section heading="Campaign list">
        {campaigns.length === 0 ? (
          <s-paragraph>No campaigns created yet.</s-paragraph>
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
                <th>Actions</th>
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
                  <td>{campaign.scheduleAt ? new Date(campaign.scheduleAt).toLocaleString() : "-"}</td>
                  <td>{new Date(campaign.updatedAt).toLocaleString()}</td>
                  <td>
                    <Form method="post">
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <button type="submit" name="intent" value="queue-campaign-send-now">
                        Send now
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading="Campaign dispatch logs">
        {logs.length === 0 ? (
          <s-paragraph>No campaign logs yet.</s-paragraph>
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
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
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
