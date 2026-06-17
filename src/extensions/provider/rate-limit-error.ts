interface AssistantErrorLike {
  role: string;
  stopReason?: string;
  provider?: string;
  errorMessage?: string;
}

/**
 * Parsed rate-limit info from Neuralwatt 429 response headers.
 *
 * Neuralwatt applies three independent rate-limit layers plus a legacy RPM
 * layer. Each sets unique headers so the client can tell which layer
 * triggered the rejection.
 *
 * @see https://portal.neuralwatt.com/docs/guides/rate-limits
 */
export interface NeuralwattRateLimitInfo {
  /** Which rate-limit layer triggered the 429 */
  layer: "concurrent" | "tpm" | "admission" | "rpm" | "unknown";
  /** Seconds the server recommends waiting before retrying */
  retryAfter?: number;
  /** Human-readable details (varies per layer) */
  detail: string;
}

/** Case-insensitive header lookup */
function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

/**
 * Parse Neuralwatt rate-limit headers from a 429 response.
 *
 * Returns `undefined` if no rate-limit-specific headers are found (e.g. the
 * 429 came from a different proxy or middleware that doesn't set these
 * headers).
 */
export function parseRateLimitHeaders(
  headers: Record<string, string>,
): NeuralwattRateLimitInfo | undefined {
  const retryAfterRaw = getHeader(headers, "Retry-After");
  const retryAfter = retryAfterRaw
    ? Number.parseInt(retryAfterRaw, 10)
    : undefined;

  // 1. Concurrent-request limit
  const concurrentDimension = getHeader(
    headers,
    "X-Concurrent-Limit-Dimension",
  );
  if (concurrentDimension) {
    const active = getHeader(headers, "X-Concurrent-Limit-Active") ?? "?";
    const max = getHeader(headers, "X-Concurrent-Limit-Max") ?? "?";
    return {
      layer: "concurrent",
      retryAfter,
      detail: `Concurrent request limit reached (${active}/${max} active, ${concurrentDimension}-scoped). Wait for an in-flight request to complete before retrying.`,
    };
  }

  // 2. Input TPM limit
  const tpmDimension = getHeader(headers, "X-TPM-Limit-Dimension");
  if (tpmDimension) {
    const tokens = getHeader(headers, "X-TPM-Limit-Tokens") ?? "?";
    const max = getHeader(headers, "X-TPM-Limit-Max") ?? "?";
    return {
      layer: "tpm",
      retryAfter,
      detail: `Input token rate exceeded (${tokens}/${max} tokens/min, ${tpmDimension}-scoped). Wait before sending more requests.`,
    };
  }

  // 3. Admission control
  const admissionDimension = getHeader(headers, "X-Admission-Dimension");
  if (admissionDimension) {
    const inFlight = getHeader(headers, "X-Admission-InFlight") ?? "?";
    const threshold = getHeader(headers, "X-Admission-Threshold") ?? "?";
    return {
      layer: "admission",
      retryAfter,
      detail: `Backend at capacity (${inFlight}/${threshold} in-flight tokens, ${admissionDimension}-scoped). The server is busy — retry shortly.`,
    };
  }

  // 4. Legacy RPM limit
  const rpmLimit = getHeader(headers, "X-RateLimit-Limit");
  if (rpmLimit) {
    const remaining = getHeader(headers, "X-RateLimit-Remaining") ?? "?";
    return {
      layer: "rpm",
      retryAfter,
      detail: `Requests per minute exceeded (${remaining}/${rpmLimit} remaining). Wait before sending more requests.`,
    };
  }

  // Generic 429 with Retry-After but no layer-specific headers
  if (retryAfter !== undefined) {
    return {
      layer: "unknown",
      retryAfter,
      detail: "Rate limited by the server. Wait before retrying.",
    };
  }

  return undefined;
}

/**
 * Build a user-facing error message from a NeuralwattRateLimitInfo.
 */
function formatRateLimitError(info: NeuralwattRateLimitInfo): string {
  const parts = [info.detail];

  if (info.retryAfter !== undefined && info.retryAfter > 0) {
    if (info.retryAfter < 60) {
      parts.push(`Retry-After: ${info.retryAfter}s.`);
    } else {
      const mins = Math.ceil(info.retryAfter / 60);
      parts.push(`Retry-After: ~${mins} min.`);
    }
  } else if (info.retryAfter === 0 && info.layer === "concurrent") {
    // Retry-After: 0 means: retry as soon as a slot frees
    parts.push("Retry immediately after an in-flight request completes.");
  }

  return `429 rate limit: ${parts.join(" ")}`;
}

/**
 * Normalize Neuralwatt rate-limit errors so the user sees which layer
 * triggered the 429 and what to do about it.
 *
 * Without this, Pi shows a generic "Too Many Requests" because the
 * Neuralwatt 429 response body is empty — all diagnostics are in the
 * response headers.
 */
export function normalizeNeuralwattRateLimitError<
  TMessage extends AssistantErrorLike,
>(message: TMessage, rateLimitInfo: NeuralwattRateLimitInfo): TMessage {
  return {
    ...message,
    errorMessage: formatRateLimitError(rateLimitInfo),
  };
}
