import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function AnalyticsPage() {
  return (
    <s-page heading="Analytics">
      <s-section>
        <s-paragraph>Analytics dashboards will appear here.</s-paragraph>
      </s-section>
    </s-page>
  );
}
