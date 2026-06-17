import { describe, expect, it } from "vitest";
import type { NeuralwattRateLimitInfo } from "./rate-limit-error";
import {
  normalizeNeuralwattRateLimitError,
  parseRateLimitHeaders,
} from "./rate-limit-error";

// ---------------------------------------------------------------------------
// parseRateLimitHeaders
// ---------------------------------------------------------------------------

describe("parseRateLimitHeaders", () => {
  it("returns undefined when no rate-limit headers are present", () => {
    expect(parseRateLimitHeaders({})).toBeUndefined();
    expect(
      parseRateLimitHeaders({ "Content-Type": "text/plain" }),
    ).toBeUndefined();
  });

  it("parses concurrent-request limit headers", () => {
    const result = parseRateLimitHeaders({
      "Retry-After": "0",
      "X-Concurrent-Limit-Dimension": "user",
      "X-Concurrent-Limit-Active": "6",
      "X-Concurrent-Limit-Max": "5",
    });

    expect(result).toEqual({
      layer: "concurrent",
      retryAfter: 0,
      detail:
        "Concurrent request limit reached (6/5 active, user-scoped). Wait for an in-flight request to complete before retrying.",
    });
  });

  it("parses concurrent limit with model-scoped dimension", () => {
    const result = parseRateLimitHeaders({
      "X-Concurrent-Limit-Dimension": "model",
      "X-Concurrent-Limit-Active": "3",
      "X-Concurrent-Limit-Max": "2",
    });

    expect(result?.layer).toBe("concurrent");
    expect(result?.detail).toContain("model-scoped");
  });

  it("parses input TPM limit headers", () => {
    const result = parseRateLimitHeaders({
      "Retry-After": "45",
      "X-TPM-Limit-Dimension": "user",
      "X-TPM-Limit-Tokens": "210000",
      "X-TPM-Limit-Max": "200000",
    });

    expect(result).toEqual({
      layer: "tpm",
      retryAfter: 45,
      detail:
        "Input token rate exceeded (210000/200000 tokens/min, user-scoped). Wait before sending more requests.",
    });
  });

  it("parses admission control headers", () => {
    const result = parseRateLimitHeaders({
      "Retry-After": "3",
      "X-Admission-Dimension": "upstream",
      "X-Admission-InFlight": "210000",
      "X-Admission-Threshold": "200000",
    });

    expect(result).toEqual({
      layer: "admission",
      retryAfter: 3,
      detail:
        "Backend at capacity (210000/200000 in-flight tokens, upstream-scoped). The server is busy — retry shortly.",
    });
  });

  it("parses legacy RPM limit headers", () => {
    const result = parseRateLimitHeaders({
      "Retry-After": "30",
      "X-RateLimit-Limit": "500",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "1700000000",
    });

    expect(result).toEqual({
      layer: "rpm",
      retryAfter: 30,
      detail:
        "Requests per minute exceeded (0/500 remaining). Wait before sending more requests.",
    });
  });

  it("handles generic 429 with Retry-After but no layer headers", () => {
    const result = parseRateLimitHeaders({
      "Retry-After": "10",
    });

    expect(result).toEqual({
      layer: "unknown",
      retryAfter: 10,
      detail: "Rate limited by the server. Wait before retrying.",
    });
  });

  it("is case-insensitive for header names", () => {
    const result = parseRateLimitHeaders({
      "retry-after": "5",
      "x-concurrent-limit-dimension": "user",
      "x-concurrent-limit-active": "3",
      "x-concurrent-limit-max": "2",
    });

    expect(result?.layer).toBe("concurrent");
    expect(result?.retryAfter).toBe(5);
  });

  it("handles missing optional detail headers gracefully", () => {
    const result = parseRateLimitHeaders({
      "X-Concurrent-Limit-Dimension": "user",
    });

    expect(result?.layer).toBe("concurrent");
    expect(result?.detail).toContain("?/? active");
  });
});

// ---------------------------------------------------------------------------
// normalizeNeuralwattRateLimitError
// ---------------------------------------------------------------------------

describe("normalizeNeuralwattRateLimitError", () => {
  const baseMessage = {
    role: "assistant" as const,
    stopReason: "error" as const,
    provider: "neuralwatt",
    errorMessage: "Too Many Requests",
  };

  it("rewrites the error message with rate-limit details (concurrent)", () => {
    const info: NeuralwattRateLimitInfo = {
      layer: "concurrent",
      retryAfter: 0,
      detail:
        "Concurrent request limit reached (6/5 active, user-scoped). Wait for an in-flight request to complete before retrying.",
    };

    const result = normalizeNeuralwattRateLimitError(baseMessage, info);
    expect(result.errorMessage).not.toBe("Too Many Requests");
    expect(result.errorMessage).toMatch(/^429 rate limit:/);
    expect(result.errorMessage).toContain("Concurrent request limit reached");
    expect(result.errorMessage).toContain(
      "Retry immediately after an in-flight request completes",
    );
  });

  it("rewrites the error message with rate-limit details (TPM)", () => {
    const info: NeuralwattRateLimitInfo = {
      layer: "tpm",
      retryAfter: 45,
      detail:
        "Input token rate exceeded (210000/200000 tokens/min, user-scoped). Wait before sending more requests.",
    };

    const result = normalizeNeuralwattRateLimitError(baseMessage, info);
    expect(result.errorMessage).toContain("Input token rate exceeded");
    expect(result.errorMessage).toContain("Retry-After: 45s.");
  });

  it("rewrites the error message with rate-limit details (admission)", () => {
    const info: NeuralwattRateLimitInfo = {
      layer: "admission",
      retryAfter: 120,
      detail:
        "Backend at capacity (210000/200000 in-flight tokens, upstream-scoped). The server is busy — retry shortly.",
    };

    const result = normalizeNeuralwattRateLimitError(baseMessage, info);
    expect(result.errorMessage).toContain("Backend at capacity");
    expect(result.errorMessage).toContain("Retry-After: ~2 min.");
  });

  it("rewrites the error message with rate-limit details (RPM)", () => {
    const info: NeuralwattRateLimitInfo = {
      layer: "rpm",
      retryAfter: 30,
      detail:
        "Requests per minute exceeded (0/500 remaining). Wait before sending more requests.",
    };

    const result = normalizeNeuralwattRateLimitError(baseMessage, info);
    expect(result.errorMessage).toContain("Requests per minute exceeded");
    expect(result.errorMessage).toContain("Retry-After: 30s.");
  });

  it("preserves other message properties", () => {
    const info: NeuralwattRateLimitInfo = {
      layer: "concurrent",
      detail: "Concurrent request limit reached.",
    };

    const result = normalizeNeuralwattRateLimitError(baseMessage, info);
    expect(result.role).toBe("assistant");
    expect(result.stopReason).toBe("error");
    expect(result.provider).toBe("neuralwatt");
  });

  it("does not add Retry-After for concurrent with no retryAfter field", () => {
    const info: NeuralwattRateLimitInfo = {
      layer: "concurrent",
      detail: "Concurrent request limit reached.",
    };

    const result = normalizeNeuralwattRateLimitError(baseMessage, info);
    expect(result.errorMessage).not.toContain("Retry-After");
    expect(result.errorMessage).not.toContain("Retry immediately");
  });
});
