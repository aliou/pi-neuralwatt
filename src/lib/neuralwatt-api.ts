import type {
  NeuralwattApiModel,
  NeuralwattApiModelsResponse,
} from "../types/models-api";
import type { NeuralwattQuotas } from "../types/quota-api";
import type { QuotasResult } from "../types/quota-result";

const BASE_URL = "https://api.neuralwatt.com/v1";
const FETCH_TIMEOUT_MS = 15_000;

function isTimeoutReason(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "TimeoutError") ||
    (reason instanceof Error && reason.name === "TimeoutError")
  );
}

function combineSignals(signal?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  return AbortSignal.any(signals);
}

async function neuralwattFetch(
  path: string,
  apiKey: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, ...headers },
    signal: combineSignals(signal),
  });
}

export type NeuralwattModelsResult =
  | { success: true; data: NeuralwattApiModel[] }
  | { success: false };

export async function fetchNeuralwattModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<NeuralwattModelsResult> {
  if (!apiKey) {
    return { success: false };
  }

  const combined = combineSignals(signal);

  try {
    const response = await neuralwattFetch("/models", apiKey, combined, {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    });

    if (!response.ok) {
      return { success: false };
    }

    const data: NeuralwattApiModelsResponse = await response.json();
    return { success: true, data: data.data };
  } catch {
    return { success: false };
  }
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

  const combined = combineSignals(signal);

  try {
    const response = await neuralwattFetch("/quota", apiKey, combined);

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
