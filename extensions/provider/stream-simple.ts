// Neuralwatt is OpenAI-compatible, but the OpenAI SDK throws on non-2xx
// responses before Pi's after_provider_response hook can see the raw headers.
// We inject a per-request `options.fetch` wrapper so 429
// rate-limit headers can be captured before the SDK turns them into a generic
// error, and tee successful SSE bodies for live quota comments, while still
// delegating normal streaming behavior to Pi's provider implementation.
// `globalThis.fetch` is never touched.
//
// The SSE tee used for live quota comments is inspired by:
// https://github.com/monotykamary/pi-neuralwatt-provider

import type {
  AssistantMessageEventStream,
  FetchFunction,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import { NEURALWATT_BASE_URL } from "./constants";
import {
  type NeuralwattRateLimitInfo,
  parseRateLimitHeaders,
} from "./rate-limit-error";
import { readQuotaCommentsFromTee } from "./sse-quotas";

export type AnyStreamSimple = (
  model: Model<string>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface NeuralwattStreamCallbacks {
  onSseQuota: (line: string) => void;
  onRateLimit: (info: NeuralwattRateLimitInfo | undefined) => void;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function isProviderStreamUrl(
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
      (url.pathname.endsWith("/chat/completions") ||
        url.pathname.endsWith("/messages"))
    );
  } catch {
    return false;
  }
}

export function wrapNeuralwattStreamSimple(
  base: AnyStreamSimple,
  callbacks: NeuralwattStreamCallbacks,
): AnyStreamSimple {
  return (model, context, options = {}) => {
    const providerOrigin = new URL(model.baseUrl ?? NEURALWATT_BASE_URL).origin;
    const callerFetch = options.fetch;

    const neuralwattFetch: FetchFunction = async (input, init) => {
      // Chain onto a caller-provided fetch when present; otherwise resolve
      // the global at request time so late host/test overrides still apply.
      const response = await (callerFetch ?? globalThis.fetch)(input, init);

      if (!isProviderStreamUrl(input, providerOrigin)) return response;

      if (response.status === 429) {
        callbacks.onRateLimit(
          parseRateLimitHeaders(headersToRecord(response.headers)),
        );
        return response;
      }

      if (response.ok && response.body) {
        const [sdkBody, quotaBody] = response.body.tee();
        // Best-effort side channel; failures inside are swallowed by the
        // reader so quota comments can never break the SDK stream.
        void readQuotaCommentsFromTee(quotaBody, callbacks.onSseQuota);
        return new Response(sdkBody, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      }

      return response;
    };

    return base(model, context, { ...options, fetch: neuralwattFetch });
  };
}
