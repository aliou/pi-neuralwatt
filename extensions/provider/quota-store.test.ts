import { describe, expect, it } from "vitest";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import { buildQuotasFromHeaders } from "./quota-store";

const HEADERS = {
  "x-allowance-remaining-usd": "32.96",
  "x-energy-included": "28.57",
  "x-energy-used": "24.96",
  "x-energy-remaining": "3.61",
  "x-subscription-plan": "max",
};

function previousQuotas(): NeuralwattQuotas {
  return {
    snapshot_at: "2026-11-22T12:00:00Z",
    balance: {
      credits_remaining_usd: 32.96,
      total_credits_usd: 32.96,
      credits_used_usd: 0,
      accounting_method: "energy",
    },
    usage: {
      lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
      current_month: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
    },
    limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    subscription: {
      plan: "max",
      status: "active",
      billing_interval: "month",
      current_period_start: "2026-10-25T00:00:00Z",
      current_period_end: "2026-11-25T00:00:00Z",
      auto_renew: true,
      kwh_included: 28.57,
      kwh_used: 24.96,
      kwh_remaining: 3.61,
      in_overage: false,
    },
    key: { name: "test", allowance: null },
  };
}

describe("buildQuotasFromHeaders", () => {
  it("retains the billing period from the latest full snapshot", () => {
    const quotas = buildQuotasFromHeaders(HEADERS, previousQuotas());

    expect(quotas?.subscription?.current_period_start).toBe(
      "2026-10-25T00:00:00Z",
    );
    expect(quotas?.subscription?.current_period_end).toBe(
      "2026-11-25T00:00:00Z",
    );
    expect(quotas?.subscription?.kwh_remaining).toBe(3.61);
  });

  it("uses null dates when no billing period is available", () => {
    const quotas = buildQuotasFromHeaders(HEADERS, undefined);

    expect(quotas?.subscription?.current_period_start).toBeNull();
    expect(quotas?.subscription?.current_period_end).toBeNull();
  });
});
