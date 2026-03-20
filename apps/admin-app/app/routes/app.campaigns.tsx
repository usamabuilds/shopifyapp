import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function CampaignsPage() {
  return (
    <s-page heading="Campaigns">
      <s-section>
        <s-paragraph>Campaign controls will appear here.</s-paragraph>
      </s-section>
    </s-page>
  );
}
