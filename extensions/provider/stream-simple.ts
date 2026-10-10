// Neuralwatt is OpenAI-compatible, but the OpenAI SDK throws on non-2xx
// responses before Pi's after_provider_response hook can see the raw headers.
// We inject a per-request `options.fetch` wrapper so 429
// rate-limit headers can be captured before the SDK turns them into a generic
// error, and tee successful SSE bodies for live quota comments, while still
// delegating normal streaming behavior to Pi's provider implementation.
// `globalThis.fetch` is never touched.
//
// The wrapper also carries the omp-only enhancements requested through
// `transport`. omp has no `before_provider_headers` hook, so the conversation-id
// header is stamped here from the `options.sessionId` omp passes; and omp throws
// on a non-ok response before any response hook runs and ignores `message_end`
// return values, so 429 / context-overflow error bodies are rewritten here
// before omp's SDK parses them. Both are off on pi, which keeps its
// `before_provider_headers` and `message_end` paths unchanged.
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
import { configuredApiBaseUrl } from "../../src/config/loader";
import { normalizeNeuralwattContextOverflowError } from "./context-overflow";
import {
  type NeuralwattRateLimitInfo,
  normalizeNeuralwattRateLimitError,
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

/**
 * omp-only per-request behaviour, opted into by the omp registration
 * (`omp.ts`). The pi registration never sets these, so the pi path keeps the
 * behaviour it had before: the header arrives through
 * `before_provider_headers` and errors are rewritten in `message_end`.
 */
export interface NeuralwattStreamTransportOptions {
  /**
   * Stamp the `options.sessionId` omp passes as `X-NW-Conversation-ID` on every
   * Neuralwatt request. pi sends the header through `before_provider_headers`
   * instead, so this must stay off there to avoid a double send.
   */
  conversationIdHeader?: boolean;
  /**
   * Rewrite the message inside a non-ok error body — 429 rate-limit details
   * from the response headers, and the `context_length_exceeded:` prefix omp's
   * overflow detection looks for — before the transport parses it. pi rewrites
   * these on the assistant message in `message_end` instead.
   */
  rewriteErrorBody?: boolean;
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

function withConversationIdHeader(
  init: RequestInit | undefined,
  sessionId: string | undefined,
): RequestInit | undefined {
  if (!sessionId) return init;
  const headers = new Headers(init?.headers);
  headers.set("X-NW-Conversation-ID", sessionId);
  return { ...(init ?? {}), headers };
}

/** JSON object bodies only; arrays and scalars carry no error envelope. */
function parseJsonObject(text: string): object | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed
    : undefined;
}

/** The message inside an OpenAI/Anthropic-style error envelope, if present. */
function readErrorMessage(text: string): string | undefined {
  const body = parseJsonObject(text);
  if (!body) return undefined;
  if (
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null
  ) {
    return "message" in body.error && typeof body.error.message === "string"
      ? body.error.message
      : undefined;
  }
  if ("error" in body && typeof body.error === "string") return body.error;
  if ("message" in body && typeof body.message === "string")
    return body.message;
  return undefined;
}

/**
 * Replace the error message in an envelope, preserving every other field
 * (including a machine `code`). Returns `undefined` when the original body
 * carried no JSON object — the caller then writes a fresh envelope.
 */
function rewriteErrorEnvelope(
  text: string,
  message: string,
): string | undefined {
  const body = parseJsonObject(text);
  if (!body) return undefined;
  if (
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null
  ) {
    return JSON.stringify({ ...body, error: { ...body.error, message } });
  }
  return JSON.stringify({ ...body, error: { message } });
}

/** The rewrite message for a 429, built from the response headers. */
function rateLimitMessage(response: Response): string {
  const info =
    parseRateLimitHeaders(headersToRecord(response.headers)) ??
    ({
      layer: "unknown",
      detail:
        "Neuralwatt rate limit reached, but the gateway did not send layer-specific rate-limit headers. Retry shortly.",
    } satisfies NeuralwattRateLimitInfo);
  const normalized = normalizeNeuralwattRateLimitError(
    {
      role: "assistant",
      stopReason: "error",
      provider: "neuralwatt",
      errorMessage: "",
    },
    info,
  );
  // omp's transports prefix the HTTP status onto the body message, so drop the
  // formatter's leading "429 " to surface the same text pi shows.
  return normalized.errorMessage?.replace(/^429 /, "") ?? "";
}

async function rewriteErrorResponse(response: Response): Promise<Response> {
  let text: string;
  try {
    // Inspect a clone so a response we leave alone keeps its original body.
    text = await response.clone().text();
  } catch {
    return response;
  }

  const message =
    response.status === 429
      ? rateLimitMessage(response)
      : normalizeNeuralwattContextOverflowError({
          role: "assistant",
          stopReason: "error",
          provider: "neuralwatt",
          errorMessage: readErrorMessage(text) ?? "",
        })?.errorMessage;
  if (message === undefined) return response;

  const headers = new Headers(response.headers);
  // The body length changes; a stale content-length would truncate the rewrite.
  headers.delete("content-length");
  return new Response(
    rewriteErrorEnvelope(text, message) ??
      JSON.stringify({ error: { message } }),
    { headers, status: response.status, statusText: response.statusText },
  );
}

export function wrapNeuralwattStreamSimple(
  base: AnyStreamSimple,
  callbacks: NeuralwattStreamCallbacks,
  transport: NeuralwattStreamTransportOptions = {},
): AnyStreamSimple {
  return (model, context, options = {}) => {
    const providerOrigin = new URL(model.baseUrl ?? configuredApiBaseUrl())
      .origin;
    const callerFetch = options.fetch;

    const neuralwattFetch: FetchFunction = async (input, init) => {
      const providerRequest = isProviderStreamUrl(input, providerOrigin);
      const requestInit =
        providerRequest && transport.conversationIdHeader
          ? withConversationIdHeader(init, options.sessionId)
          : init;

      // Chain onto a caller-provided fetch when present; otherwise resolve
      // the global at request time so late host/test overrides still apply.
      const response = await (callerFetch ?? globalThis.fetch)(
        input,
        requestInit,
      );

      if (!providerRequest) return response;

      if (response.status === 429) {
        callbacks.onRateLimit(
          parseRateLimitHeaders(headersToRecord(response.headers)),
        );
      }

      if (transport.rewriteErrorBody && !response.ok) {
        return rewriteErrorResponse(response);
      }

      if (response.status === 429) return response;

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
