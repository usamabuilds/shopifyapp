import type {
  OutboundProviderAdapter,
  ProviderFailureCode,
  ProviderSendRequest,
  ProviderSendResult,
} from "./outbound-messaging.server";

type WhatsappCloudProviderConfig = {
  phoneNumberId: string;
  accessToken: string;
  tokenType: string;
};

type GraphApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function mapFailureCode(status: number, providerCode?: number): ProviderFailureCode {
  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }

  if (status === 408 || status === 504) {
    return "TIMEOUT";
  }

  if (status === 429) {
    return "RATE_LIMIT";
  }

  if (status >= 500) {
    return "SERVICE_UNAVAILABLE";
  }

  if (status === 400 || providerCode === 100 || providerCode === 131026) {
    return "INVALID_RECIPIENT";
  }

  return "UNKNOWN";
}

function extractProviderMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "WhatsApp provider request failed.";
  }

  const providerPayload = payload as GraphApiError;

  return providerPayload.error?.message?.slice(0, 280) ?? "WhatsApp provider request failed.";
}

export class WhatsAppCloudProviderAdapter implements OutboundProviderAdapter {
  readonly providerName = "meta_whatsapp_cloud";

  private readonly config: WhatsappCloudProviderConfig;

  constructor(config: WhatsappCloudProviderConfig) {
    this.config = config;
  }

  async sendMessage(input: ProviderSendRequest): Promise<ProviderSendResult> {
    const textBody = this.extractTextPayload(input.payload);

    if (!textBody) {
      return {
        ok: false,
        code: "UNKNOWN",
        message: "Unsupported outbound payload for WhatsApp Cloud test send.",
      };
    }

    const endpoint = `https://graph.facebook.com/v22.0/${this.config.phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `${this.config.tokenType} ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.recipientAddress,
        type: "text",
        text: {
          body: textBody,
          preview_url: false,
        },
      }),
    });

    let responsePayload: unknown = null;

    try {
      responsePayload = await response.json();
    } catch {
      responsePayload = null;
    }

    if (!response.ok) {
      const providerCode = (responsePayload as GraphApiError | null)?.error?.code;

      return {
        ok: false,
        code: mapFailureCode(response.status, providerCode),
        message: extractProviderMessage(responsePayload),
        rawResponse: responsePayload,
      };
    }

    const providerMessageId = this.extractProviderMessageId(responsePayload);

    if (!providerMessageId) {
      return {
        ok: false,
        code: "UNKNOWN",
        message: "WhatsApp provider response did not include a message id.",
        rawResponse: responsePayload,
      };
    }

    return {
      ok: true,
      providerMessageId,
      rawResponse: responsePayload,
    };
  }

  private extractTextPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const value = (payload as { text?: unknown }).text;

    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 1024) : null;
  }

  private extractProviderMessageId(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const messages = (payload as { messages?: Array<{ id?: unknown }> }).messages;
    const firstId = messages?.[0]?.id;

    return typeof firstId === "string" && firstId.trim().length > 0 ? firstId : null;
  }
}
