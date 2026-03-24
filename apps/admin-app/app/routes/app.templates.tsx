import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { getCartRecoverySettings } from "../automations.cart-recovery.server";
import { getOrderConfirmationSettings } from "../automations.order-confirmation.server";
import { getOrderStatusUpdateSettings } from "../automations.order-status-updates.server";
import { getBroadcastCampaignSettings } from "../campaigns.broadcast.server";
import { authenticate } from "../shopify.server";
import { getMerchantWhatsappConnectionState } from "../whatsapp-connection.server";
import {
  listSyncedWhatsappTemplates,
  requestWhatsappTemplateSync,
  resolveTemplateSyncVisualState,
  type TemplateSyncVisualState,
} from "../whatsapp-templates.server";

type TemplateUseCase = "ORDER_CONFIRMATION" | "ORDER_STATUS_UPDATES" | "CART_RECOVERY" | "BROADCAST_CAMPAIGNS";
type TemplateStatus = "APPROVED" | "PAUSED" | "REJECTED" | "UNAVAILABLE" | "DRAFT";

type LocalTemplate = {
  key: string;
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  status: TemplateStatus;
  mappedUseCases: TemplateUseCase[];
  updatedAt: string;
  content: {
    header: string;
    body: string;
    footer?: string;
  };
  providerTemplateId: string;
};

type FlowMapping = {
  flowLabel: string;
  flowKey: string;
  useCase: TemplateUseCase;
  configuredTemplateKey: string;
  template: LocalTemplate | null;
  status: "CONNECTED" | "MISSING_TEMPLATE_KEY" | "NOT_FOUND_IN_LIBRARY" | "CATEGORY_MISMATCH";
};

type SampleContext = Record<string, string>;

const TEMPLATE_STATUS_TONE: Record<TemplateStatus, "success" | "info" | "warning" | "critical"> = {
  APPROVED: "success",
  DRAFT: "info",
  PAUSED: "warning",
  REJECTED: "critical",
  UNAVAILABLE: "critical",
};

const USE_CASE_LABELS: Record<TemplateUseCase, string> = {
  ORDER_CONFIRMATION: "Order confirmation",
  ORDER_STATUS_UPDATES: "Order status updates",
  CART_RECOVERY: "Cart recovery",
  BROADCAST_CAMPAIGNS: "Broadcast campaigns",
};

const USE_CASE_CATEGORY_EXPECTATION: Record<TemplateUseCase, LocalTemplate["category"]> = {
  ORDER_CONFIRMATION: "UTILITY",
  ORDER_STATUS_UPDATES: "UTILITY",
  CART_RECOVERY: "MARKETING",
  BROADCAST_CAMPAIGNS: "MARKETING",
};

function resolveMappingStatus(row: {
  configuredTemplateKey: string;
  useCase: TemplateUseCase;
  template: LocalTemplate | null;
}): FlowMapping["status"] {
  if (row.configuredTemplateKey.length === 0) {
    return "MISSING_TEMPLATE_KEY";
  }

  if (!row.template) {
    return "NOT_FOUND_IN_LIBRARY";
  }

  return USE_CASE_CATEGORY_EXPECTATION[row.useCase] !== row.template.category
    ? "CATEGORY_MISMATCH"
    : "CONNECTED";
}

const TEMPLATE_SYNC_STATE_LABELS: Record<TemplateSyncVisualState, string> = {
  NEVER_SYNCED: "Never synced",
  SYNCING: "Syncing",
  SYNCED: "Synced",
  SYNC_FAILED: "Sync failed",
  STALE: "Stale",
};

const TEMPLATE_SYNC_STATE_TONES: Record<TemplateSyncVisualState, "info" | "warning" | "success" | "critical"> = {
  NEVER_SYNCED: "info",
  SYNCING: "warning",
  SYNCED: "success",
  SYNC_FAILED: "critical",
  STALE: "warning",
};

function extractTemplateVariables(template: LocalTemplate): string[] {
  const combined = [template.content.header, template.content.body, template.content.footer ?? ""].join(" ");
  const matches = combined.match(/{{\s*[a-z0-9_]+\s*}}/gi) ?? [];

  return [...new Set(matches.map((match) => match.replace(/[{}\s]/g, "")))];
}

function renderTemplate(content: string, context: SampleContext): { rendered: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  const rendered = content.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, variable: string) => {
    const value = context[variable];

    if (!value) {
      unresolved.add(variable);
      return `{{${variable}}}`;
    }

    return value;
  });

  return {
    rendered,
    unresolved: [...unresolved],
  };
}

function getSampleContexts() {
  return {
    ORDER_CONFIRMATION: {
      customer_first_name: "Avery",
      order_number: "1045",
      total_price: "89.50",
      currency: "USD",
      order_id: "gid://shopify/Order/1045",
    },
    ORDER_STATUS_UPDATES: {
      customer_first_name: "Avery",
      order_number: "1045",
      status_label: "out for delivery",
      tracking_url: "https://tracking.example.com/track/1045",
      currency: "USD",
    },
    CART_RECOVERY: {
      customer_first_name: "Avery",
      cart_subtotal: "64.00",
      currency: "USD",
      checkout_url: "https://checkout.example.com/recover/abc123",
      checkout_id: "abc123",
    },
    BROADCAST_CAMPAIGNS: {
      campaign_name: "Weekend Flash Sale",
      message_body: "Save 20% through Sunday",
      campaign_url: "https://store.example.com/collections/sale",
      audience_name: "Recent buyers",
    },
  } satisfies Record<TemplateUseCase, SampleContext>;
}

function parseUseCase(value: string | null): TemplateUseCase {
  if (
    value === "ORDER_CONFIRMATION"
    || value === "ORDER_STATUS_UPDATES"
    || value === "CART_RECOVERY"
    || value === "BROADCAST_CAMPAIGNS"
  ) {
    return value;
  }

  return "ORDER_CONFIRMATION";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [confirmationSettings, orderStatusSettings, cartRecoverySettings, campaignSettings, connection, syncedTemplates] = await Promise.all([
    getOrderConfirmationSettings(session.shop),
    getOrderStatusUpdateSettings(session.shop),
    getCartRecoverySettings(session.shop),
    getBroadcastCampaignSettings(session.shop),
    getMerchantWhatsappConnectionState(session.shop),
    listSyncedWhatsappTemplates(session.shop),
  ]);

  const templates: LocalTemplate[] = syncedTemplates.map((template) => ({
    ...template,
    mappedUseCases: [],
  }));
  const byKey = new Map(templates.map((template) => [template.key, template]));

  const mappingRows: FlowMapping[] = [
    {
      flowLabel: "Order confirmation",
      flowKey: "order_confirmation",
      useCase: "ORDER_CONFIRMATION",
      configuredTemplateKey: confirmationSettings.templateKey,
      template: byKey.get(confirmationSettings.templateKey) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: confirmationSettings.templateKey,
        useCase: "ORDER_CONFIRMATION",
        template: byKey.get(confirmationSettings.templateKey) ?? null,
      }),
    },
    {
      flowLabel: "Order status: partially fulfilled",
      flowKey: "order_status_partial",
      useCase: "ORDER_STATUS_UPDATES",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED,
        useCase: "ORDER_STATUS_UPDATES",
        template: byKey.get(orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED) ?? null,
      }),
    },
    {
      flowLabel: "Order status: fulfilled",
      flowKey: "order_status_fulfilled",
      useCase: "ORDER_STATUS_UPDATES",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_FULFILLED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_FULFILLED) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_FULFILLED,
        useCase: "ORDER_STATUS_UPDATES",
        template: byKey.get(orderStatusSettings.templateByStatus.ORDER_FULFILLED) ?? null,
      }),
    },
    {
      flowLabel: "Order status: out for delivery",
      flowKey: "order_status_out_for_delivery",
      useCase: "ORDER_STATUS_UPDATES",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY,
        useCase: "ORDER_STATUS_UPDATES",
        template: byKey.get(orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY) ?? null,
      }),
    },
    {
      flowLabel: "Order status: delivered",
      flowKey: "order_status_delivered",
      useCase: "ORDER_STATUS_UPDATES",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_DELIVERED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_DELIVERED) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_DELIVERED,
        useCase: "ORDER_STATUS_UPDATES",
        template: byKey.get(orderStatusSettings.templateByStatus.ORDER_DELIVERED) ?? null,
      }),
    },
    {
      flowLabel: "Order status: cancelled",
      flowKey: "order_status_cancelled",
      useCase: "ORDER_STATUS_UPDATES",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_CANCELLED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_CANCELLED) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_CANCELLED,
        useCase: "ORDER_STATUS_UPDATES",
        template: byKey.get(orderStatusSettings.templateByStatus.ORDER_CANCELLED) ?? null,
      }),
    },
    {
      flowLabel: "Cart recovery",
      flowKey: "cart_recovery",
      useCase: "CART_RECOVERY",
      configuredTemplateKey: cartRecoverySettings.templateKey,
      template: byKey.get(cartRecoverySettings.templateKey) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: cartRecoverySettings.templateKey,
        useCase: "CART_RECOVERY",
        template: byKey.get(cartRecoverySettings.templateKey) ?? null,
      }),
    },
    {
      flowLabel: "Broadcast campaigns default",
      flowKey: "broadcast_campaign_default",
      useCase: "BROADCAST_CAMPAIGNS",
      configuredTemplateKey: campaignSettings.defaultTemplateKey,
      template: byKey.get(campaignSettings.defaultTemplateKey) ?? null,
      status: resolveMappingStatus({
        configuredTemplateKey: campaignSettings.defaultTemplateKey,
        useCase: "BROADCAST_CAMPAIGNS",
        template: byKey.get(campaignSettings.defaultTemplateKey) ?? null,
      }),
    },
  ];

  const mappedUseCasesByTemplateKey = new Map<string, Set<TemplateUseCase>>();

  for (const row of mappingRows) {
    if (!row.template) {
      continue;
    }

    const bucket = mappedUseCasesByTemplateKey.get(row.template.key) ?? new Set<TemplateUseCase>();
    bucket.add(row.useCase);
    mappedUseCasesByTemplateKey.set(row.template.key, bucket);
  }

  const templatesWithMappings = templates.map((template) => ({
    ...template,
    mappedUseCases: [...(mappedUseCasesByTemplateKey.get(template.key) ?? new Set<TemplateUseCase>())],
  }));

  const url = new URL(request.url);
  const selectedTemplateKey = url.searchParams.get("template") ?? templatesWithMappings[0]?.key ?? "";
  const selectedUseCase = parseUseCase(url.searchParams.get("useCase"));
  const syncVisualState = resolveTemplateSyncVisualState({
    syncStatus: connection.syncStatus,
    lastSyncedAt: connection.lastSyncedAt,
  });

  return {
    connection,
    templates: templatesWithMappings,
    syncVisualState,
    mappingRows,
    selectedTemplateKey,
    selectedUseCase,
    sampleContexts: getSampleContexts(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "sync_templates") {
    return {
      synced: false,
      message: "Unsupported action.",
    };
  }

  const result = await requestWhatsappTemplateSync(session.shop);

  return {
    synced: result.ok,
    message: result.ok
      ? "Template sync completed and library refreshed."
      : result.reason,
    completedAt: new Date().toISOString(),
  };
};

export default function TemplatesPage() {
  const { connection, templates, syncVisualState, mappingRows, selectedTemplateKey, selectedUseCase, sampleContexts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const syncing = navigation.state === "submitting";

  const selectedTemplate = templates.find((template) => template.key === selectedTemplateKey) ?? templates[0] ?? null;
  const context = sampleContexts[selectedUseCase];

  if (templates.length === 0) {
    return (
      <s-page heading="Templates">
        <s-section heading="Template library">
          <s-banner tone="info">
            No synced templates available yet. Start sync from WhatsApp connection or refresh below.
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  const statusWarnings: string[] = [];

  if (selectedTemplate && (selectedTemplate.status === "PAUSED" || selectedTemplate.status === "REJECTED" || selectedTemplate.status === "UNAVAILABLE")) {
    statusWarnings.push(`Template state is ${selectedTemplate.status.toLowerCase()}. Messages can be blocked for mapped flows.`);
  }

  if (selectedTemplate && USE_CASE_CATEGORY_EXPECTATION[selectedUseCase] !== selectedTemplate.category) {
    statusWarnings.push(
      `Category mismatch: ${USE_CASE_LABELS[selectedUseCase]} expects ${USE_CASE_CATEGORY_EXPECTATION[selectedUseCase]} templates but selected template is ${selectedTemplate.category}.`,
    );
  }

  const renderedHeader = selectedTemplate ? renderTemplate(selectedTemplate.content.header, context) : null;
  const renderedBody = selectedTemplate ? renderTemplate(selectedTemplate.content.body, context) : null;
  const renderedFooter = selectedTemplate?.content.footer
    ? renderTemplate(selectedTemplate.content.footer, context)
    : null;

  const unresolvedVariableSet = new Set<string>([
    ...(renderedHeader?.unresolved ?? []),
    ...(renderedBody?.unresolved ?? []),
    ...(renderedFooter?.unresolved ?? []),
  ]);
  const unresolvedVariables = [...unresolvedVariableSet];

  return (
    <s-page heading="Templates">
      {navigation.state === "loading" ? (
        <s-banner tone="info">Loading template details...</s-banner>
      ) : null}

      <s-section heading="Template library">
        <s-paragraph>
          Synced provider templates for this merchant connection.
        </s-paragraph>
        <s-banner tone={TEMPLATE_SYNC_STATE_TONES[syncVisualState]}>
          Sync state: <strong>{TEMPLATE_SYNC_STATE_LABELS[syncVisualState]}</strong>. Last synced:{" "}
          <strong>{connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}</strong>.
        </s-banner>
        <Form method="post">
          <button type="submit" name="intent" value="sync_templates" disabled={syncing}>
            {syncing ? "Syncing…" : "Refresh synced templates"}
          </button>
        </Form>
        {actionData?.message ? (
          <s-banner tone={actionData.synced ? "success" : "critical"}>{actionData.message}</s-banner>
        ) : null}
        <s-banner tone="info">
          Category assumptions used in Phase 1: order confirmation/status are utility, cart recovery/broadcast are
          marketing. Map templates accordingly.
        </s-banner>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Language</th>
              <th>Status</th>
              <th>Mapped use cases</th>
              <th>Updated</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.key}>
                <td>{template.name}</td>
                <td>{template.category}</td>
                <td>{template.language}</td>
                <td>{template.status}</td>
                <td>{template.mappedUseCases.length > 0 ? template.mappedUseCases.map((item) => USE_CASE_LABELS[item]).join(", ") : "-"}</td>
                <td>{new Date(template.updatedAt).toLocaleString()}</td>
                <td>
                  <Link to={`/app/templates?template=${encodeURIComponent(template.key)}&useCase=${selectedUseCase}`}>
                    Open preview
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </s-section>

      <s-section heading="Flow mapping visibility">
        <s-paragraph>
          Shows how existing automation and campaign foundations map to template keys today.
        </s-paragraph>
        <table>
          <thead>
            <tr>
              <th>Flow</th>
              <th>Use case</th>
              <th>Configured template key</th>
              <th>Library match</th>
              <th>Mapping status</th>
            </tr>
          </thead>
          <tbody>
            {mappingRows.map((row) => (
              <tr key={row.flowKey}>
                <td>{row.flowLabel}</td>
                <td>{USE_CASE_LABELS[row.useCase]}</td>
                <td>{row.configuredTemplateKey || "-"}</td>
                <td>{row.template?.name ?? "-"}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {mappingRows.some((item) => item.status !== "CONNECTED") ? (
          <s-banner tone="warning">
            One or more flows have missing keys, unmatched templates, or category mismatches. Update keys and category mapping in Automations/Campaigns before sending.
          </s-banner>
        ) : (
          <s-banner tone="success">All current flow mappings resolve to templates in the local library.</s-banner>
        )}
      </s-section>

      {selectedTemplate ? (
        <>
          <s-section heading={`Template detail: ${selectedTemplate.name}`}>
            <s-stack direction="block" gap="small">
              <s-banner tone={TEMPLATE_STATUS_TONE[selectedTemplate.status]}>
                Current state: <strong>{selectedTemplate.status}</strong>
              </s-banner>
              <s-paragraph>
                Key: <code>{selectedTemplate.key}</code>
              </s-paragraph>
              <s-paragraph>
                Provider ID: <code>{selectedTemplate.providerTemplateId}</code>
              </s-paragraph>
              <s-paragraph>
                Variables: {extractTemplateVariables(selectedTemplate).map((item) => <code key={item}>{item} </code>)}
              </s-paragraph>
            </s-stack>
          </s-section>

          <s-section heading="Variable preview & testing foundation">
            <s-stack direction="block" gap="small">
              <s-paragraph>Choose a sample flow context:</s-paragraph>
              <s-stack direction="inline" gap="small">
                {(Object.keys(USE_CASE_LABELS) as TemplateUseCase[]).map((useCase) => (
                  <Link key={useCase} to={`/app/templates?template=${encodeURIComponent(selectedTemplate.key)}&useCase=${useCase}`}>
                    {USE_CASE_LABELS[useCase]}
                  </Link>
                ))}
              </s-stack>
              <s-paragraph>
                Using sample context: <strong>{USE_CASE_LABELS[selectedUseCase]}</strong>
              </s-paragraph>
              <pre>{JSON.stringify(context, null, 2)}</pre>
            </s-stack>

            {statusWarnings.map((warning) => (
              <s-banner key={warning} tone="warning">
                {warning}
              </s-banner>
            ))}

            {unresolvedVariables.length > 0 ? (
              <s-banner tone="critical">
                Unresolved placeholders for this test data: {unresolvedVariables.map((variable) => `{{${variable}}}`).join(", ")}
              </s-banner>
            ) : (
              <s-banner tone="success">All placeholders resolved with current sample data.</s-banner>
            )}

            <s-stack direction="block" gap="small">
              <s-paragraph>
                <strong>Header preview</strong>
              </s-paragraph>
              <pre>{renderedHeader?.rendered}</pre>
              <s-paragraph>
                <strong>Body preview</strong>
              </s-paragraph>
              <pre>{renderedBody?.rendered}</pre>
              {selectedTemplate.content.footer ? (
                <>
                  <s-paragraph>
                    <strong>Footer preview</strong>
                  </s-paragraph>
                  <pre>{renderedFooter?.rendered}</pre>
                </>
              ) : null}
            </s-stack>
          </s-section>
        </>
      ) : (
        <s-section heading="Template detail">
          <s-banner tone="info">Select a template from the list to inspect details and test variables.</s-banner>
        </s-section>
      )}
    </s-page>
  );
}
