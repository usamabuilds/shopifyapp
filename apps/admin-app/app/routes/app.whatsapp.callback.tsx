import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { completeMetaWhatsappAuth, parseMetaOauthState } from "../whatsapp-connection.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);
  const stateParam = requestUrl.searchParams.get("state");
  const parsedState = parseMetaOauthState(stateParam);
  let shopDomain = parsedState?.shopDomain ?? null;
  let callbackSessionSource = "state";

  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
    callbackSessionSource = "shopify_session";
  } catch {
    // OAuth callback can return outside active embedded session. We still verify state nonce server-side.
  }

  if (!shopDomain) {
    const params = new URLSearchParams();
    params.set("authResult", "failed");
    params.set("authMessage", "Unable to resolve shop context from callback. Restart Meta connection from WhatsApp setup.");
    throw redirect(`/app/whatsapp?${params.toString()}`);
  }

  const result = await completeMetaWhatsappAuth({
    shopDomain,
    state: stateParam,
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
  params.set("authSource", callbackSessionSource);
  params.set("authTimestamp", new Date().toISOString());

  throw redirect(`/app/whatsapp?${params.toString()}`);
};

export default function WhatsAppCallbackRoute() {
  return null;
}
