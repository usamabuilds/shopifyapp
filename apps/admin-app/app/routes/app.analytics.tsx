import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { ensureShopFoundation } from "../models.shop.server";
import { authenticate } from "../shopify.server";

type AnalyticsScope = "7d" | "30d" | "90d" | "all";

type OutboundMessageStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "RETRY_SCHEDULED"
  | "DEAD_LETTER";

type OutboundUseCase = "order_confirmation" | "order_status_update" | "cart_recovery" | "broadcast" | "custom";

type OrderConfirmationStatus =
  | "PENDING"
  | "SKIPPED_DISABLED"
  | "SKIPPED_NOT_ELIGIBLE"
  | "QUEUED"
  | "SENT"
  | "FAILED";

type OrderStatusUpdateState =
  | "PENDING"
  | "SKIPPED_DISABLED"
  | "SKIPPED_NOT_ELIGIBLE"
  | "SKIPPED_MISSING_TEMPLATE"
  | "DUPLICATE_SUPPRESSED"
  | "QUEUED"
  | "SENT"
  | "FAILED";

type CartRecoveryState =
  | "PENDING_WAIT"
  | "SKIPPED_DISABLED"
  | "SKIPPED_NOT_ELIGIBLE"
  | "SKIPPED_MISSING_TEMPLATE"
  | "DUPLICATE_SUPPRESSED"
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "RECOVERED";

type BroadcastCampaignStatus = "DRAFT" | "SCHEDULED" | "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

type PrismaAnalyticsDb = {
  outboundMessage: {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      id: string;
      useCase: OutboundUseCase;
      status: OutboundMessageStatus;
      updatedAt: Date;
      createdAt: Date;
      recipientAddress: string;
      statusReason: string | null;
    }>>;
  };
  orderConfirmation: {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      id: string;
      orderId: string;
      status: OrderConfirmationStatus;
      statusReason: string | null;
      templateKey: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>;
  };
  orderStatusUpdate: {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      id: string;
      orderId: string;
      state: OrderStatusUpdateState;
      statusType: string;
      stateReason: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>;
  };
  cartRecovery: {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      id: string;
      checkoutId: string;
      state: CartRecoveryState;
      stateReason: string | null;
      checkoutSubtotalAmount: string | null;
      checkoutCurrencyCode: string | null;
      recoveredRevenueAmount: string | null;
      recoveredCurrencyCode: string | null;
      recoveredOrderId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>;
  };
  broadcastCampaign: {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      id: string;
      name: string;
      status: BroadcastCampaignStatus;
      totalRecipients: number;
      sentRecipients: number;
      failedRecipients: number;
      createdAt: Date;
      updatedAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
    }>>;
  };
};

const db = prisma as unknown as PrismaAnalyticsDb;

const OUTBOUND_STATUSES: OutboundMessageStatus[] = [
  "PENDING",
  "SENDING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "RETRY_SCHEDULED",
  "DEAD_LETTER",
];
const OUTBOUND_USE_CASES: OutboundUseCase[] = ["order_confirmation", "order_status_update", "cart_recovery", "broadcast", "custom"];
const CONFIRMATION_STATUSES: OrderConfirmationStatus[] = ["PENDING", "SKIPPED_DISABLED", "SKIPPED_NOT_ELIGIBLE", "QUEUED", "SENT", "FAILED"];
const STATUS_UPDATE_STATES: OrderStatusUpdateState[] = [
  "PENDING",
  "SKIPPED_DISABLED",
  "SKIPPED_NOT_ELIGIBLE",
  "SKIPPED_MISSING_TEMPLATE",
  "DUPLICATE_SUPPRESSED",
  "QUEUED",
  "SENT",
  "FAILED",
];
const CART_RECOVERY_STATES: CartRecoveryState[] = [
  "PENDING_WAIT",
  "SKIPPED_DISABLED",
  "SKIPPED_NOT_ELIGIBLE",
  "SKIPPED_MISSING_TEMPLATE",
  "DUPLICATE_SUPPRESSED",
  "QUEUED",
  "SENT",
  "FAILED",
  "RECOVERED",
];
const CAMPAIGN_STATUSES: BroadcastCampaignStatus[] = ["DRAFT", "SCHEDULED", "QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"];

function parseScope(raw: string | null): AnalyticsScope {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") {
    return raw;
  }

  return "30d";
}

function sinceForScope(scope: AnalyticsScope): Date | null {
  if (scope === "all") {
    return null;
  }

  const now = Date.now();
  const days = scope === "7d" ? 7 : scope === "90d" ? 90 : 30;

  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function whereForScope(shopDomain: string, since: Date | null) {
  return since
    ? {
        shopDomain,
        createdAt: {
          gte: since,
        },
      }
    : { shopDomain };
}

function summarizeStatus<TStatus extends string>(rows: TStatus[]) {
  return rows.reduce<Record<string, number>>((acc, status) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

function parseNumber(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureShopFoundation(session.shop);

  const url = new URL(request.url);
  const scope = parseScope(url.searchParams.get("scope"));
  const since = sinceForScope(scope);
  const scopedWhere = whereForScope(session.shop, since);

  const [outboundMessages, orderConfirmations, orderStatusUpdates, cartRecoveries, campaigns] = await Promise.all([
    db.outboundMessage.findMany({
      where: scopedWhere,
      select: {
        id: true,
        useCase: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        recipientAddress: true,
        statusReason: true,
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.orderConfirmation.findMany({
      where: scopedWhere,
      select: {
        id: true,
        orderId: true,
        status: true,
        statusReason: true,
        templateKey: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.orderStatusUpdate.findMany({
      where: scopedWhere,
      select: {
        id: true,
        orderId: true,
        state: true,
        statusType: true,
        stateReason: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.cartRecovery.findMany({
      where: scopedWhere,
      select: {
        id: true,
        checkoutId: true,
        state: true,
        stateReason: true,
        checkoutSubtotalAmount: true,
        checkoutCurrencyCode: true,
        recoveredRevenueAmount: true,
        recoveredCurrencyCode: true,
        recoveredOrderId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.broadcastCampaign.findMany({
      where: scopedWhere,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentRecipients: true,
        failedRecipients: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const outboundByStatus = summarizeStatus(outboundMessages.map((item) => item.status));
  const confirmationsByStatus = summarizeStatus(orderConfirmations.map((item) => item.status));
  const statusUpdatesByState = summarizeStatus(orderStatusUpdates.map((item) => item.state));
  const statusUpdatesByType = summarizeStatus(orderStatusUpdates.map((item) => item.statusType));
  const cartRecoveriesByState = summarizeStatus(cartRecoveries.map((item) => item.state));
  const campaignsByStatus = summarizeStatus(campaigns.map((item) => item.status));

  const recoveredRows = cartRecoveries.filter((item) => item.state === "RECOVERED");
  const recoveredRevenueTotal = recoveredRows.reduce((sum, item) => sum + parseNumber(item.recoveredRevenueAmount), 0);
  const recoveredRevenueCurrency = recoveredRows.find((item) => item.recoveredCurrencyCode)?.recoveredCurrencyCode ?? null;

  const overallSummary = {
    outboundMessages: outboundMessages.length,
    sentOrDeliveredMessages:
      (outboundByStatus.SENT ?? 0) + (outboundByStatus.DELIVERED ?? 0),
    failedMessages: (outboundByStatus.FAILED ?? 0) + (outboundByStatus.DEAD_LETTER ?? 0),
    ordersTouched: orderConfirmations.length + orderStatusUpdates.length,
    recoveredCarts: cartRecoveriesByState.RECOVERED ?? 0,
    campaignsCreated: campaigns.length,
  };

  const campaignRecipientRollup = campaigns.reduce(
    (acc, campaign) => {
      acc.total += campaign.totalRecipients;
      acc.sent += campaign.sentRecipients;
      acc.failed += campaign.failedRecipients;
      return acc;
    },
    { total: 0, sent: 0, failed: 0 },
  );

  return {
    scope,
    sinceIso: since ? since.toISOString() : null,
    overallSummary,
    outbound: {
      total: outboundMessages.length,
      byStatus: OUTBOUND_STATUSES.map((status) => ({ status, count: outboundByStatus[status] ?? 0 })),
      byUseCase: OUTBOUND_USE_CASES.map((useCase) => ({
        useCase,
        total: outboundMessages.filter((item) => item.useCase === useCase).length,
        sentOrDelivered: outboundMessages.filter(
          (item) => item.useCase === useCase && (item.status === "SENT" || item.status === "DELIVERED"),
        ).length,
        failed: outboundMessages.filter(
          (item) => item.useCase === useCase && (item.status === "FAILED" || item.status === "DEAD_LETTER"),
        ).length,
      })),
      recent: outboundMessages.slice(0, 10),
    },
    confirmations: {
      total: orderConfirmations.length,
      byStatus: CONFIRMATION_STATUSES.map((status) => ({ status, count: confirmationsByStatus[status] ?? 0 })),
      recent: orderConfirmations.slice(0, 10),
    },
    orderStatusUpdates: {
      total: orderStatusUpdates.length,
      byState: STATUS_UPDATE_STATES.map((state) => ({ state, count: statusUpdatesByState[state] ?? 0 })),
      byType: Object.entries(statusUpdatesByType)
        .sort((a, b) => b[1] - a[1])
        .map(([statusType, count]) => ({ statusType, count })),
      recent: orderStatusUpdates.slice(0, 10),
    },
    cartRecovery: {
      total: cartRecoveries.length,
      byState: CART_RECOVERY_STATES.map((state) => ({ state, count: cartRecoveriesByState[state] ?? 0 })),
      recoveredCount: cartRecoveriesByState.RECOVERED ?? 0,
      recoveredRevenueTotal,
      recoveredRevenueCurrency,
      recent: cartRecoveries.slice(0, 10),
    },
    campaigns: {
      total: campaigns.length,
      byStatus: CAMPAIGN_STATUSES.map((status) => ({ status, count: campaignsByStatus[status] ?? 0 })),
      recipientRollup: campaignRecipientRollup,
      recent: campaigns.slice(0, 10),
    },
  };
};

function metricValue(value: number) {
  return value.toLocaleString();
}

function formatScopeLabel(scope: AnalyticsScope): string {
  if (scope === "7d") return "Last 7 days";
  if (scope === "90d") return "Last 90 days";
  if (scope === "all") return "All time";
  return "Last 30 days";
}

function ScopeLink({ scope, currentScope }: { scope: AnalyticsScope; currentScope: AnalyticsScope }) {
  const isActive = scope === currentScope;

  return isActive ? (
    <strong>{formatScopeLabel(scope)}</strong>
  ) : (
    <Link to={`/app/analytics?scope=${scope}`}>{formatScopeLabel(scope)}</Link>
  );
}

function StatusTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) {
    return <s-banner tone="info">No activity in this scope yet.</s-banner>;
  }

  return (
    <table>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              // eslint-disable-next-line react/no-array-index-key
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnalyticsPage() {
  const analytics = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <s-page heading="Analytics">
      <s-section heading="Scope">
        <s-stack direction="block" gap="small">
          <s-paragraph>Filter metrics by a simple reporting window.</s-paragraph>
          <s-stack direction="inline" gap="base">
            <ScopeLink scope="7d" currentScope={analytics.scope} />
            <ScopeLink scope="30d" currentScope={analytics.scope} />
            <ScopeLink scope="90d" currentScope={analytics.scope} />
            <ScopeLink scope="all" currentScope={analytics.scope} />
          </s-stack>
          <s-paragraph>
            Showing: <strong>{formatScopeLabel(analytics.scope)}</strong>
            {analytics.sinceIso ? ` (since ${new Date(analytics.sinceIso).toLocaleDateString()})` : ""}
          </s-paragraph>
          {isLoading ? <s-banner tone="info">Refreshing analytics…</s-banner> : null}
        </s-stack>
      </s-section>

      <s-section heading="Summary outcomes">
        <s-stack direction="inline" gap="base">
          <s-banner tone="info">
            <s-paragraph>Outbound messages: {metricValue(analytics.overallSummary.outboundMessages)}</s-paragraph>
            <s-paragraph>All attempted outbound messages in this scope.</s-paragraph>
          </s-banner>
          <s-banner tone="success">
            <s-paragraph>Sent or delivered: {metricValue(analytics.overallSummary.sentOrDeliveredMessages)}</s-paragraph>
            <s-paragraph>Messages that reached sent/delivered status.</s-paragraph>
          </s-banner>
          <s-banner tone="critical">
            <s-paragraph>Failed delivery attempts: {metricValue(analytics.overallSummary.failedMessages)}</s-paragraph>
            <s-paragraph>Messages ending in failed/dead-letter outcomes.</s-paragraph>
          </s-banner>
        </s-stack>
        <s-stack direction="inline" gap="base">
          <s-banner tone="info">
            <s-paragraph>Order events touched: {metricValue(analytics.overallSummary.ordersTouched)}</s-paragraph>
            <s-paragraph>Order confirmations plus order status update records.</s-paragraph>
          </s-banner>
          <s-banner tone="success">
            <s-paragraph>Recovered carts: {metricValue(analytics.overallSummary.recoveredCarts)}</s-paragraph>
            <s-paragraph>Cart recovery records attributed to recovered orders.</s-paragraph>
          </s-banner>
          <s-banner tone="info">
            <s-paragraph>Campaigns created: {metricValue(analytics.overallSummary.campaignsCreated)}</s-paragraph>
            <s-paragraph>Broadcast campaigns created in the selected scope.</s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>

      <s-section heading="Outbound messaging outcomes">
        <s-paragraph>
          This view summarizes message pipeline outcomes across order confirmations, order status updates, cart recovery,
          and campaigns.
        </s-paragraph>
        <StatusTable
          headers={["Status", "Count"]}
          rows={analytics.outbound.byStatus.map((item) => [item.status, metricValue(item.count)])}
        />
        <s-paragraph>
          Use-case performance (sent/delivered versus failed) based on persisted outbound messages.
        </s-paragraph>
        <StatusTable
          headers={["Use case", "Total", "Sent/Delivered", "Failed"]}
          rows={analytics.outbound.byUseCase
            .filter((item) => item.total > 0)
            .map((item) => [item.useCase, metricValue(item.total), metricValue(item.sentOrDelivered), metricValue(item.failed)])}
        />
      </s-section>

      <s-section heading="Order confirmation activity">
        <s-paragraph>Tracks outcomes for confirmation attempts triggered by order creation events.</s-paragraph>
        <StatusTable
          headers={["Status", "Count"]}
          rows={analytics.confirmations.byStatus.map((item) => [item.status, metricValue(item.count)])}
        />
        <s-paragraph>Most recent confirmation records:</s-paragraph>
        <StatusTable
          headers={["Order", "Status", "Reason", "Updated"]}
          rows={analytics.confirmations.recent.map((item) => [
            item.orderId,
            item.status,
            item.statusReason ?? "—",
            new Date(item.updatedAt).toLocaleString(),
          ])}
        />
      </s-section>

      <s-section heading="Order status update activity">
        <s-paragraph>Shows how order lifecycle updates were mapped and processed for outbound notifications.</s-paragraph>
        <StatusTable
          headers={["State", "Count"]}
          rows={analytics.orderStatusUpdates.byState.map((item) => [item.state, metricValue(item.count)])}
        />
        <s-paragraph>Status types seen in this scope:</s-paragraph>
        <StatusTable
          headers={["Status type", "Count"]}
          rows={analytics.orderStatusUpdates.byType.map((item) => [item.statusType, metricValue(item.count)])}
        />
      </s-section>

      <s-section heading="Cart recovery activity & attribution groundwork">
        <s-paragraph>
          Recovery records below show waiting, sent, and recovered states. Recovered means an order was attributed to a
          prior recovery touch.
        </s-paragraph>
        <StatusTable
          headers={["State", "Count"]}
          rows={analytics.cartRecovery.byState.map((item) => [item.state, metricValue(item.count)])}
        />
        <s-banner tone="info">
          Attributed recovered carts: {metricValue(analytics.cartRecovery.recoveredCount)}
          {analytics.cartRecovery.recoveredRevenueTotal > 0
            ? ` · Attributed revenue: ${analytics.cartRecovery.recoveredRevenueTotal.toFixed(2)} ${analytics.cartRecovery.recoveredRevenueCurrency ?? ""}`
            : " · Revenue attribution appears when recovery records include recovered order totals."}
        </s-banner>
      </s-section>

      <s-section heading="Campaign activity">
        <s-paragraph>Broadcast campaign execution and recipient-level rollups from existing campaign records.</s-paragraph>
        <StatusTable
          headers={["Campaign status", "Count"]}
          rows={analytics.campaigns.byStatus.map((item) => [item.status, metricValue(item.count)])}
        />
        <s-banner tone="info">
          Recipients targeted: {metricValue(analytics.campaigns.recipientRollup.total)} · Sent: {metricValue(analytics.campaigns.recipientRollup.sent)} · Failed: {metricValue(analytics.campaigns.recipientRollup.failed)}
        </s-banner>
        <s-paragraph>Recent campaigns:</s-paragraph>
        <StatusTable
          headers={["Campaign", "Status", "Recipients", "Sent", "Failed", "Updated"]}
          rows={analytics.campaigns.recent.map((item) => [
            item.name,
            item.status,
            metricValue(item.totalRecipients),
            metricValue(item.sentRecipients),
            metricValue(item.failedRecipients),
            new Date(item.updatedAt).toLocaleString(),
          ])}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
