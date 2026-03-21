import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigation } from "react-router";

import { getCartRecoverySettings } from "../automations.cart-recovery.server";
import { getOrderConfirmationSettings } from "../automations.order-confirmation.server";
import { getOrderStatusUpdateSettings } from "../automations.order-status-updates.server";
import { getBroadcastCampaignSettings } from "../campaigns.broadcast.server";
import { authenticate } from "../shopify.server";

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
};

type FlowMapping = {
  flowLabel: string;
  flowKey: string;
  configuredTemplateKey: string;
  template: LocalTemplate | null;
  status: "CONNECTED" | "MISSING_TEMPLATE_KEY" | "NOT_FOUND_IN_LIBRARY";
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

function buildLocalTemplates(): LocalTemplate[] {
  const now = Date.now();

  return [
    {
      key: "order_confirmation_v1",
      name: "Order confirmation (default)",
      category: "UTILITY",
      language: "en_US",
      status: "APPROVED",
      mappedUseCases: ["ORDER_CONFIRMATION"],
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "Order #{{order_number}} confirmed",
        body: "Hi {{customer_first_name}}, thanks for your order #{{order_number}}. Total: {{total_price}} {{currency}}.",
        footer: "Reply STOP to opt out",
      },
    },
    {
      key: "order_status_delivery_v2",
      name: "Order status update",
      category: "UTILITY",
      language: "en_US",
      status: "APPROVED",
      mappedUseCases: ["ORDER_STATUS_UPDATES"],
      updatedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "Order #{{order_number}} status",
        body: "Update: your order #{{order_number}} is {{status_label}}. Tracking: {{tracking_url}}",
      },
    },
    {
      key: "cart_recovery_nudge_v1",
      name: "Cart recovery nudge",
      category: "MARKETING",
      language: "en_US",
      status: "PAUSED",
      mappedUseCases: ["CART_RECOVERY"],
      updatedAt: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "You left something behind",
        body: "Hi {{customer_first_name}}, your cart worth {{cart_subtotal}} {{currency}} is waiting: {{checkout_url}}",
      },
    },
    {
      key: "broadcast_flash_sale_v3",
      name: "Flash sale broadcast",
      category: "MARKETING",
      language: "en_US",
      status: "REJECTED",
      mappedUseCases: ["BROADCAST_CAMPAIGNS"],
      updatedAt: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "{{campaign_name}}",
        body: "{{message_body}} Shop now: {{campaign_url}}",
      },
    },
    {
      key: "legacy_unavailable_template",
      name: "Legacy utility template",
      category: "UTILITY",
      language: "en_US",
      status: "UNAVAILABLE",
      mappedUseCases: ["ORDER_CONFIRMATION", "ORDER_STATUS_UPDATES"],
      updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      content: {
        header: "Legacy",
        body: "Order {{order_number}} update for {{customer_first_name}}",
      },
    },
  ];
}

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

  const [confirmationSettings, orderStatusSettings, cartRecoverySettings, campaignSettings] = await Promise.all([
    getOrderConfirmationSettings(session.shop),
    getOrderStatusUpdateSettings(session.shop),
    getCartRecoverySettings(session.shop),
    getBroadcastCampaignSettings(session.shop),
  ]);

  const templates = buildLocalTemplates();
  const byKey = new Map(templates.map((template) => [template.key, template]));

  const mappingRows: FlowMapping[] = [
    {
      flowLabel: "Order confirmation",
      flowKey: "order_confirmation",
      configuredTemplateKey: confirmationSettings.templateKey,
      template: byKey.get(confirmationSettings.templateKey) ?? null,
      status:
        confirmationSettings.templateKey.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(confirmationSettings.templateKey)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Order status: partially fulfilled",
      flowKey: "order_status_partial",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED) ?? null,
      status:
        orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(orderStatusSettings.templateByStatus.ORDER_PARTIALLY_FULFILLED)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Order status: fulfilled",
      flowKey: "order_status_fulfilled",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_FULFILLED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_FULFILLED) ?? null,
      status:
        orderStatusSettings.templateByStatus.ORDER_FULFILLED.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(orderStatusSettings.templateByStatus.ORDER_FULFILLED)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Order status: out for delivery",
      flowKey: "order_status_out_for_delivery",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY) ?? null,
      status:
        orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(orderStatusSettings.templateByStatus.ORDER_OUT_FOR_DELIVERY)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Order status: delivered",
      flowKey: "order_status_delivered",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_DELIVERED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_DELIVERED) ?? null,
      status:
        orderStatusSettings.templateByStatus.ORDER_DELIVERED.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(orderStatusSettings.templateByStatus.ORDER_DELIVERED)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Order status: cancelled",
      flowKey: "order_status_cancelled",
      configuredTemplateKey: orderStatusSettings.templateByStatus.ORDER_CANCELLED,
      template: byKey.get(orderStatusSettings.templateByStatus.ORDER_CANCELLED) ?? null,
      status:
        orderStatusSettings.templateByStatus.ORDER_CANCELLED.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(orderStatusSettings.templateByStatus.ORDER_CANCELLED)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Cart recovery",
      flowKey: "cart_recovery",
      configuredTemplateKey: cartRecoverySettings.templateKey,
      template: byKey.get(cartRecoverySettings.templateKey) ?? null,
      status:
        cartRecoverySettings.templateKey.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(cartRecoverySettings.templateKey)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
    {
      flowLabel: "Broadcast campaigns default",
      flowKey: "broadcast_campaign_default",
      configuredTemplateKey: campaignSettings.defaultTemplateKey,
      template: byKey.get(campaignSettings.defaultTemplateKey) ?? null,
      status:
        campaignSettings.defaultTemplateKey.length === 0
          ? "MISSING_TEMPLATE_KEY"
          : byKey.has(campaignSettings.defaultTemplateKey)
            ? "CONNECTED"
            : "NOT_FOUND_IN_LIBRARY",
    },
  ];

  const url = new URL(request.url);
  const selectedTemplateKey = url.searchParams.get("template") ?? templates[0]?.key ?? "";
  const selectedUseCase = parseUseCase(url.searchParams.get("useCase"));

  return {
    templates,
    mappingRows,
    selectedTemplateKey,
    selectedUseCase,
    sampleContexts: getSampleContexts(),
  };
};

export default function TemplatesPage() {
  const { templates, mappingRows, selectedTemplateKey, selectedUseCase, sampleContexts } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const selectedTemplate = templates.find((template) => template.key === selectedTemplateKey) ?? templates[0] ?? null;
  const context = sampleContexts[selectedUseCase];

  if (templates.length === 0) {
    return (
      <s-page heading="Templates">
        <s-section heading="Template library">
          <s-banner tone="info">
            No local templates available yet. Add template records in this foundation before wiring provider sync.
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  const statusWarnings: string[] = [];

  if (selectedTemplate && (selectedTemplate.status === "PAUSED" || selectedTemplate.status === "REJECTED" || selectedTemplate.status === "UNAVAILABLE")) {
    statusWarnings.push(`Template state is ${selectedTemplate.status.toLowerCase()}. Messages can be blocked for mapped flows.`);
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
          Merchant-facing local template management foundation. This view is intentionally local and does not sync real provider templates yet.
        </s-paragraph>

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
                <td>{template.mappedUseCases.map((item) => USE_CASE_LABELS[item]).join(", ")}</td>
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
              <th>Configured template key</th>
              <th>Library match</th>
              <th>Mapping status</th>
            </tr>
          </thead>
          <tbody>
            {mappingRows.map((row) => (
              <tr key={row.flowKey}>
                <td>{row.flowLabel}</td>
                <td>{row.configuredTemplateKey || "-"}</td>
                <td>{row.template?.name ?? "-"}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {mappingRows.some((item) => item.status !== "CONNECTED") ? (
          <s-banner tone="warning">
            One or more flows have missing or unmatched template keys. Update keys in Automations/Campaigns to avoid skipped sends.
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
