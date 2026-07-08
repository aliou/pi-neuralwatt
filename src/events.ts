import type { ResolvedNeuralwattConfig } from "./config";
import type { NeuralwattQuotas } from "./types/quota-api";

export type NeuralwattFeatureId =
  | "quotaCommand"
  | "quotaWarnings"
  | "subBarIntegration";

export const NEURALWATT_EXTENSIONS_REQUEST_EVENT =
  "neuralwatt:extensions:request" as const;

export const NEURALWATT_EXTENSIONS_REGISTER_EVENT =
  "neuralwatt:extensions:register" as const;

export const NEURALWATT_CONFIG_UPDATED_EVENT =
  "neuralwatt:config:updated" as const;

export const NEURALWATT_QUOTAS_UPDATED_EVENT =
  "neuralwatt:quotas:updated" as const;

export const NEURALWATT_QUOTAS_REQUEST_EVENT =
  "neuralwatt:quotas:request" as const;

export const NEURALWATT_ALLOWANCES_UPDATED_EVENT =
  "neuralwatt:allowances:updated" as const;

export interface NeuralwattExtensionsRegisterPayload {
  feature: NeuralwattFeatureId;
}

export interface NeuralwattConfigUpdatedPayload {
  config: ResolvedNeuralwattConfig;
}

export type QuotaSource = "header" | "api" | "sse";

export interface NeuralwattQuotasUpdatedPayload {
  quotas: NeuralwattQuotas;
  source: QuotaSource;
}

export interface NeuralwattHeaderAllowances {
  sessionSpentUsd: number;
  sessionAllowanceRemainingUsd: number | null;
}

export interface NeuralwattAllowancesUpdatedPayload
  extends NeuralwattHeaderAllowances {
  sessionId: string;
  sessionAllowanceUsd: number | null;
  requestAllowanceUsd: number | null;
  updatedAt: string;
}

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
function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

function tryFloat(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function safeFloat(v: string | undefined, fallback = 0): number {
  return tryFloat(v) ?? fallback;
}

export function parseQuotaHeaders(
  headers: Record<string, string>,
): NeuralwattHeaderQuotas | undefined {
  const remaining = getHeader(headers, "x-allowance-remaining-usd");
  if (!remaining) return undefined;

  return {
    allowanceRemainingUsd: safeFloat(remaining),
    budgetRemainingUsd: safeFloat(getHeader(headers, "x-budget-remaining-usd")),
    requestCostUsd: safeFloat(getHeader(headers, "x-request-cost-usd")),
    cacheSavingsUsd: safeFloat(getHeader(headers, "x-cache-savings-usd")),
    subscriptionPlan: getHeader(headers, "x-subscription-plan") ?? "none",
    energyIncluded: tryFloat(getHeader(headers, "x-energy-included")),
    energyRemaining: tryFloat(getHeader(headers, "x-energy-remaining")),
    energyUsed: tryFloat(getHeader(headers, "x-energy-used")),
  };
}

/** Parse Neuralwatt allowance headers from after_provider_response. */
export function parseAllowanceHeaders(
  headers: Record<string, string>,
): NeuralwattHeaderAllowances | undefined {
  const spent = tryFloat(getHeader(headers, "x-session-spent-usd"));
  if (spent === undefined) return undefined;

  return {
    sessionSpentUsd: spent,
    sessionAllowanceRemainingUsd:
      tryFloat(getHeader(headers, "x-session-allowance-remaining-usd")) ?? null,
  };
}
