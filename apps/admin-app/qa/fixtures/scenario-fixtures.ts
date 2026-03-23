export type FixtureTopic = "orders/create" | "orders/updated" | "fulfillments/create" | "checkouts/update";

export type ScenarioFixture = {
  name: string;
  topic: FixtureTopic;
  payload: Record<string, unknown>;
};

const fixtures: ScenarioFixture[] = [
  {
    name: "order-created-paid-happy-path",
    topic: "orders/create",
    payload: {
      id: 1045,
      order_number: 1045,
      financial_status: "paid",
      fulfillment_status: null,
      cancelled_at: null,
      total_price: "89.50",
      phone: "+15551230001",
      customer: { id: 5101, phone: "+15551230001" },
    },
  },
  {
    name: "order-updated-fulfilled",
    topic: "orders/updated",
    payload: {
      id: 1045,
      order_number: 1045,
      fulfillment_status: "fulfilled",
      cancelled_at: null,
      updated_at: "2026-03-23T14:00:00.000Z",
      customer: { phone: "+15551230001" },
    },
  },
  {
    name: "fulfillment-out-for-delivery",
    topic: "fulfillments/create",
    payload: {
      id: "fulfillment_01",
      order_id: 1045,
      shipment_status: "out_for_delivery",
      updated_at: "2026-03-23T15:00:00.000Z",
      shipping_address: { phone: "+15551230001" },
    },
  },
  {
    name: "checkout-abandoned",
    topic: "checkouts/update",
    payload: {
      id: "checkout_abc123",
      abandoned_checkout_url: "https://checkout.example.com/recover/abc123",
      total_price: "64.00",
      currency: "USD",
      completed_at: null,
      phone: "+15551230001",
      customer: { id: "customer_01", phone: "+15551230001" },
      updated_at: "2026-03-23T13:00:00.000Z",
    },
  },
];

export const scenarioFixtures = fixtures;

export function getScenarioFixture(name: string): ScenarioFixture {
  const fixture = scenarioFixtures.find((candidate) => candidate.name === name);
  if (!fixture) {
    throw new Error(`Unknown scenario fixture '${name}'.`);
  }

  return structuredClone(fixture);
}

export function listScenarioFixtureNames(): string[] {
  return scenarioFixtures.map((fixture) => fixture.name);
}

export const duplicateSuppressionCases = [
  {
    feature: "order_confirmation",
    dedupeKeyHint: "shopDomain + orderId unique constraint",
    fixtureName: "order-created-paid-happy-path",
  },
  {
    feature: "order_status_updates",
    dedupeKeyHint: "shopDomain + orderId + statusType",
    fixtureName: "order-updated-fulfilled",
  },
  {
    feature: "cart_recovery",
    dedupeKeyHint: "shopDomain + checkoutId + recoveryType",
    fixtureName: "checkout-abandoned",
  },
  {
    feature: "broadcast_campaigns",
    dedupeKeyHint: "audience recipient normalization + dedupeRecipients",
    fixtureName: "order-created-paid-happy-path",
  },
] as const;
