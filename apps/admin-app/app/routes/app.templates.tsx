import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function TemplatesPage() {
  return (
    <s-page heading="Templates">
      <s-section>
        <s-paragraph>Template management will appear here.</s-paragraph>
      </s-section>
    </s-page>
  );
}
