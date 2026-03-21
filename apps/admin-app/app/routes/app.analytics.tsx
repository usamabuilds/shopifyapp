import type { LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function AnalyticsPage() {
  return (
    <s-page heading="Analytics">
      <s-section heading="Operational analytics foundation">
        <s-banner tone="info">
          A dedicated analytics dashboard is not part of this phase yet. Use the dashboard overview and activity tables
          for current operational visibility.
        </s-banner>
        <s-paragraph>
          <Link to="/app">Return to dashboard overview</Link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
