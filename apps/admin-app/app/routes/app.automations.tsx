import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function AutomationsPage() {
  return (
    <s-page heading="Automations">
      <s-section>
        <s-paragraph>Automation workflows will appear here.</s-paragraph>
      </s-section>
    </s-page>
  );
}
