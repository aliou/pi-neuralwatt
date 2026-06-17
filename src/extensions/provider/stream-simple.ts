// Neuralwatt is OpenAI-compatible, but the OpenAI SDK throws on non-2xx
// responses before Pi's after_provider_response hook can see the raw headers.
// We wrap the built-in openai-completions streamSimple so 429 rate-limit
// headers can be captured before the SDK turns them into a generic error, while
// still delegating normal streaming behavior to Pi's provider implementation.
//
// The SSE tee used for live quota comments is inspired by:
// https://github.com/monotykamary/pi-neuralwatt-provider

import {
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
  type NeuralwattRateLimitInfo,
  normalizeNeuralwattRateLimitError,
  parseRateLimitHeaders,
} from "./rate-limit-error";
import { readQuotaCommentsFromTee } from "./sse-quotas";

export type AnyStreamSimple = (
  model: Model<string>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function isProviderChatCompletionsUrl(
  input: RequestInfo | URL,
  providerOrigin: string,
): boolean {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const url = new URL(rawUrl);
    return (
      url.origin === providerOrigin &&
      url.pathname.endsWith("/chat/completions")
    );
  } catch {
    return false;
  }
}

async function forwardStream(
  stream: AssistantMessageEventStream,
  outer: AssistantMessageEventStream,
  getRateLimitInfo: () => NeuralwattRateLimitInfo | undefined,
  restoreFetch: () => void,
): Promise<void> {
  try {
    for await (const event of stream) {
      const rateLimitInfo = getRateLimitInfo();
      if (event.type === "error" && rateLimitInfo) {
        outer.push({
          ...event,
          error: normalizeNeuralwattRateLimitError(event.error, rateLimitInfo),
        });
      } else {
        outer.push(event);
      }
    }
  } finally {
    restoreFetch();
    outer.end();
  }
}

export function wrapNeuralwattStreamSimple(
  base: AnyStreamSimple,
  onSseQuota: (line: string) => void,
): AnyStreamSimple {
  return (model, context, options = {}) => {
    let rateLimitInfo: NeuralwattRateLimitInfo | undefined;
    let sseQuotaTask: Promise<void> | undefined;
    const outer = createAssistantMessageEventStream();
    const providerOrigin = new URL(
      model.baseUrl ?? "https://api.neuralwatt.com/v1",
    ).origin;
    const originalFetch = globalThis.fetch;
    const wrappedFetch: typeof fetch = async (input, init) => {
      const response = await originalFetch(input, init);

      if (!isProviderChatCompletionsUrl(input, providerOrigin)) return response;

      const headers = headersToRecord(response.headers);
      if (response.status === 429) {
        rateLimitInfo = parseRateLimitHeaders(headers);
        return response;
      }

      if (response.ok && response.body) {
        const [sdkBody, quotaBody] = response.body.tee();
        sseQuotaTask = readQuotaCommentsFromTee(quotaBody, onSseQuota);
        return new Response(sdkBody, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      }

      return response;
    };

    globalThis.fetch = wrappedFetch;

    const restoreFetch = () => {
      if (globalThis.fetch === wrappedFetch) globalThis.fetch = originalFetch;
      sseQuotaTask?.catch(() => {});
    };

    const stream = base(model, context, options);
    const originalOuterEnd = outer.end.bind(outer);
    outer.end = (result?: Parameters<typeof originalOuterEnd>[0]) => {
      restoreFetch();
      originalOuterEnd(result);
    };

    void forwardStream(stream, outer, () => rateLimitInfo, restoreFetch);

    return outer;
  };
}
