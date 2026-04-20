import type { NeuralwattQuotas } from "../types/quota-api";
import type { QuotasResult } from "../types/quota-events";

const FETCH_TIMEOUT_MS = 15_000;

function isTimeoutReason(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "TimeoutError") ||
    (reason instanceof Error && reason.name === "TimeoutError")
  );
}

export async function fetchQuotas(
  apiKey: string,
  signal?: AbortSignal,
): Promise<QuotasResult> {
  if (!apiKey) {
    return {
      success: false,
      error: { message: "No API key provided", kind: "config" },
    };
  }

  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  const combined = AbortSignal.any(signals);

  try {
    const response = await fetch("https://api.neuralwatt.com/v1/quota", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: combined,
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.text();
        if (body) {
          try {
            const parsed = JSON.parse(body) as { error?: string };
            if (parsed.error) message = parsed.error;
          } catch {
            message = body;
          }
        }
      } catch {
        return { success: false, error: { message, kind: "http" } };
      }
      return { success: false, error: { message, kind: "http" } };
    }

    const data: NeuralwattQuotas = await response.json();
    return { success: true, data: { quotas: data } };
  } catch (err: unknown) {
    const isAbort =
      combined.aborted ||
      (err instanceof DOMException && err.name === "AbortError");
    if (isAbort) {
      if (isTimeoutReason(combined.reason)) {
        return {
          success: false,
          error: { message: "Request timed out", kind: "timeout" },
        };
      }
      return {
        success: false,
        error: { message: "Request cancelled", kind: "cancelled" },
      };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: { message, kind: "network" } };
  }
}
