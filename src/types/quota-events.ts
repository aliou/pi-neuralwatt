import type { NeuralwattQuotas } from "./quota-api";

export type QuotaSource = "header" | "api";

export const NEURALWATT_QUOTAS_UPDATED_EVENT =
  "neuralwatt:quotas:updated" as const;

export const NEURALWATT_QUOTAS_REQUEST_EVENT =
  "neuralwatt:quotas:request" as const;

export interface NeuralwattQuotasUpdatedPayload {
  quotas: NeuralwattQuotas;
  source: QuotaSource;
}

export type QuotasErrorKind =
  | "cancelled"
  | "timeout"
  | "config"
  | "http"
  | "network";

export type QuotasResult =
  | { success: true; data: { quotas: NeuralwattQuotas } }
  | { success: false; error: { message: string; kind: QuotasErrorKind } };

/** Minimal quota data parsed from response headers */
export interface NeuralwattHeaderQuotas {
  allowanceRemainingUsd: number;
  budgetRemainingUsd: number;
  requestCostUsd: number;
  cacheSavingsUsd: number;
  subscriptionPlan: string;
  energyIncluded?: number;
  energyRemaining?: number;
  energyUsed?: number;
}

/** Parse Neuralwatt quota headers from after_provider_response */
export function parseQuotaHeaders(
  headers: Record<string, string>,
): NeuralwattHeaderQuotas | undefined {
  const get = (name: string): string | undefined => {
    const entry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return entry?.[1];
  };

  const remaining = get("x-allowance-remaining-usd");
  if (!remaining) return undefined;

  const tryFloat = (v: string | undefined): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const safeFloat = (v: string | undefined, fallback = 0): number =>
    tryFloat(v) ?? fallback;

  return {
    allowanceRemainingUsd: safeFloat(remaining),
    budgetRemainingUsd: safeFloat(get("x-budget-remaining-usd")),
    requestCostUsd: safeFloat(get("x-request-cost-usd")),
    cacheSavingsUsd: safeFloat(get("x-cache-savings-usd")),
    subscriptionPlan: get("x-subscription-plan") ?? "none",
    energyIncluded: tryFloat(get("x-energy-included")),
    energyRemaining: tryFloat(get("x-energy-remaining")),
    energyUsed: tryFloat(get("x-energy-used")),
  };
}
