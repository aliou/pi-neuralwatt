import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { parseQuotaHeaders } from "../../src/events";
import { fetchQuotas } from "../../src/lib/neuralwatt-api";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import { getNeuralwattApiKey } from "../_shared/auth";

export function buildQuotasFromHeaders(
  headers: Record<string, string>,
): NeuralwattQuotas | undefined {
  const headerQuotas = parseQuotaHeaders(headers);
  if (!headerQuotas) return;

  return {
    snapshot_at: new Date().toISOString(),
    balance: {
      credits_remaining_usd: headerQuotas.allowanceRemainingUsd,
      total_credits_usd: 0,
      credits_used_usd: 0,
      accounting_method: "token",
    },
    usage: {
      lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
      current_month: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
    },
    limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    subscription:
      headerQuotas.subscriptionPlan !== "none" &&
      headerQuotas.energyRemaining !== undefined
        ? {
            plan: headerQuotas.subscriptionPlan,
            status: "active",
            billing_interval: "month",
            current_period_start: "",
            current_period_end: "",
            auto_renew: false,
            kwh_included: headerQuotas.energyIncluded ?? 0,
            kwh_used: headerQuotas.energyUsed ?? 0,
            kwh_remaining: headerQuotas.energyRemaining,
            in_overage: false,
          }
        : null,
    key: { name: "", allowance: null },
  };
}

export async function fetchRequestedQuotas(
  data: unknown,
): Promise<NeuralwattQuotas | undefined> {
  if (!data || typeof data !== "object") return;
  const { authStorage } = data as { authStorage?: AuthStorage };
  if (!authStorage) return;
  const apiKey = await getNeuralwattApiKey(authStorage);
  if (!apiKey) return;
  const result = await fetchQuotas(apiKey);
  if (!result.success) return;
  return result.data.quotas;
}
