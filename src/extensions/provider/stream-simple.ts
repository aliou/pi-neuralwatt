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

export function wrapNeuralwattStreamSimple(
  base: AnyStreamSimple,
  onSseQuota: (line: string) => void,
): AnyStreamSimple {
  return (model, context, options = {}) => {
    let rateLimitInfo: NeuralwattRateLimitInfo | undefined;
    let teeReader: Promise<void> | undefined;
    const outer = createAssistantMessageEventStream();
    const originalFetch = globalThis.fetch;
    const wrappedFetch: typeof fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (!url.includes("/chat/completions")) return response;

      const headers = headersToRecord(response.headers);
      if (response.status === 429) {
        rateLimitInfo = parseRateLimitHeaders(headers);
        return response;
      }

      if (response.ok && response.body) {
        const [sdkBody, quotaBody] = response.body.tee();
        teeReader = readQuotaCommentsFromTee(quotaBody, onSseQuota);
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
      teeReader?.catch(() => {});
    };

    const stream = base(model, context, options);
    const originalOuterEnd = outer.end.bind(outer);
    outer.end = (result?: Parameters<typeof originalOuterEnd>[0]) => {
      restoreFetch();
      originalOuterEnd(result);
    };

    (async () => {
      try {
        for await (const event of stream as AsyncIterable<
          Parameters<AssistantMessageEventStream["push"]>[0]
        >) {
          if (event.type === "error" && rateLimitInfo) {
            outer.push({
              ...event,
              error: normalizeNeuralwattRateLimitError(
                event.error,
                rateLimitInfo,
              ),
            });
          } else {
            outer.push(event);
          }
        }
      } finally {
        restoreFetch();
        outer.end();
      }
    })();

    return outer;
  };
}
