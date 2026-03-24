import type {
  OutboundProviderAdapter,
  ProviderFailureCode,
  ProviderSendFailure,
  ProviderSendRequest,
  ProviderSendResult,
} from "./outbound-messaging.server";

type WhatsappCloudProviderConfig = {
  phoneNumberId: string;
  accessToken: string;
  tokenType: string;
};

type TemplateComponentParameter = {
  type: "text";
  text: string;
};

type TemplateComponent = {
  type: "header" | "body";
  parameters: TemplateComponentParameter[];
};

type TemplatePayload = {
  type: "template";
  template: {
    name: string;
    languageCode: string;
    components?: TemplateComponent[];
  };
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
    const endpoint = `https://graph.facebook.com/v22.0/${this.config.phoneNumberId}/messages`;
    const providerPayload = this.buildProviderPayload(input.payload, input.recipientAddress);

    if (!providerPayload.ok) {
      return providerPayload.failure;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `${this.config.tokenType} ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(providerPayload.body),
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

  private buildProviderPayload(payload: unknown, recipientAddress: string):
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; failure: ProviderSendFailure } {
    const templatePayload = this.extractTemplatePayload(payload);

    if (templatePayload) {
      return {
        ok: true,
        body: {
          messaging_product: "whatsapp",
          to: recipientAddress,
          type: "template",
          template: {
            name: templatePayload.template.name,
            language: {
              code: templatePayload.template.languageCode,
            },
            components: templatePayload.template.components ?? [],
          },
        },
      };
    }

    const textBody = this.extractTextPayload(payload);

    if (textBody) {
      return {
        ok: true,
        body: {
          messaging_product: "whatsapp",
          to: recipientAddress,
          type: "text",
          text: {
            body: textBody,
            preview_url: false,
          },
        },
      };
    }

    return {
      ok: false,
      failure: {
        ok: false,
        code: "UNKNOWN",
        message: "Unsupported outbound payload for WhatsApp Cloud provider send.",
      },
    };
  }

  private extractTemplatePayload(payload: unknown): TemplatePayload | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const typedPayload = payload as {
      type?: unknown;
      template?: {
        name?: unknown;
        languageCode?: unknown;
        components?: unknown;
      };
    };

    if (typedPayload.type !== "template") {
      return null;
    }

    const templateName = typeof typedPayload.template?.name === "string"
      ? typedPayload.template.name.trim()
      : "";
    const languageCode = typeof typedPayload.template?.languageCode === "string"
      ? typedPayload.template.languageCode.trim()
      : "";

    if (!templateName || !languageCode) {
      return null;
    }

    const parsedComponents = this.parseTemplateComponents(typedPayload.template?.components);

    if (parsedComponents === null) {
      return null;
    }

    return {
      type: "template",
      template: {
        name: templateName,
        languageCode,
        components: parsedComponents,
      },
    };
  }

  private parseTemplateComponents(value: unknown): TemplateComponent[] | null {
    if (!value) {
      return [];
    }

    if (!Array.isArray(value)) {
      return null;
    }

    const parsed: TemplateComponent[] = [];

    for (const component of value) {
      if (!component || typeof component !== "object") {
        return null;
      }

      const rawType = (component as { type?: unknown }).type;
      const rawParameters = (component as { parameters?: unknown }).parameters;

      if (rawType !== "header" && rawType !== "body") {
        return null;
      }

      if (!Array.isArray(rawParameters)) {
        return null;
      }

      const parameters: TemplateComponentParameter[] = [];

      for (const parameter of rawParameters) {
        if (!parameter || typeof parameter !== "object") {
          return null;
        }

        const parameterType = (parameter as { type?: unknown }).type;
        const parameterText = (parameter as { text?: unknown }).text;

        if (parameterType !== "text" || typeof parameterText !== "string" || parameterText.trim().length === 0) {
          return null;
        }

        parameters.push({
          type: "text",
          text: parameterText,
        });
      }

      parsed.push({
        type: rawType,
        parameters,
      });
    }

    return parsed;
  }

  private extractTextPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object" || (payload as { type?: unknown }).type === "template") {
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
