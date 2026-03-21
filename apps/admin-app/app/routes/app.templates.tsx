import type { LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function TemplatesPage() {
  return (
    <s-page heading="Templates">
      <s-section heading="Message templates foundation">
        <s-banner tone="info">
          Template management UI is not configured yet in this phase. Existing automations and campaigns still accept
          template keys from their settings screens.
        </s-banner>
        <s-stack direction="block" gap="small">
          <s-paragraph>
            <Link to="/app/automations">Configure template keys in automations</Link>
          </s-paragraph>
          <s-paragraph>
            <Link to="/app/campaigns">Set the campaign default template key</Link>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
