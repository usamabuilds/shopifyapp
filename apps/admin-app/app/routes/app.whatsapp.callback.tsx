import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { completeMetaWhatsappAuth } from "../whatsapp-connection.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);

  const result = await completeMetaWhatsappAuth({
    shopDomain: session.shop,
    state: requestUrl.searchParams.get("state"),
    code: requestUrl.searchParams.get("code"),
    error: requestUrl.searchParams.get("error"),
    errorDescription: requestUrl.searchParams.get("error_description"),
    businessAccountId: requestUrl.searchParams.get("business_account_id") ?? requestUrl.searchParams.get("waba_id"),
    phoneNumberId: requestUrl.searchParams.get("phone_number_id"),
    displayPhoneNumber: requestUrl.searchParams.get("display_phone_number"),
  });

  const params = new URLSearchParams();
  params.set("authResult", result.ok ? "success" : "failed");
  params.set("authMessage", result.message);

  throw redirect(`/app/whatsapp?${params.toString()}`);
};

export default function WhatsAppCallbackRoute() {
  return null;
}
