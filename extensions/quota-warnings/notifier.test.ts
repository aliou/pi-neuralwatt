import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import {
  checkQuotas,
  clearAlertState,
  computeOverageProgress,
} from "./notifier";

function mockCtx(): ExtensionContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    hasUI: true,
    model: { provider: "neuralwatt" } as never,
    ui: {
      notify: (msg: string, level: string) => {
        calls.push(`${level}: ${msg}`);
      },
    },
  } as unknown as ExtensionContext & { calls: string[] };
}

function baseQuotas(
  overrides: Partial<NeuralwattQuotas> = {},
): NeuralwattQuotas {
  return {
    snapshot_at: "2026-07-22T14:25:43Z",
    balance: {
      credits_remaining_usd: 35.68,
      total_credits_usd: 35.68,
      credits_used_usd: 0,
      accounting_method: "energy",
    },
    usage: {
      lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
      current_month: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
    },
    limits: { overage_limit_usd: 10, rate_limit_tier: "standard" },
    subscription: {
      plan: "standard",
      status: "active",
      billing_interval: "month",
      current_period_start: "",
      current_period_end: "",
      auto_renew: true,
      kwh_included: 16,
      kwh_used: 8,
      kwh_remaining: 8,
      in_overage: false,
    },
    key: { name: "test", allowance: null },
    ...overrides,
  };
}

/** A non-null subscription fixture to spread in test overrides. */
function subFixture(): NonNullable<NeuralwattQuotas["subscription"]> {
  return baseQuotas().subscription as NonNullable<
    NeuralwattQuotas["subscription"]
  >;
}

describe("computeOverageProgress", () => {
  it("subscribed: bills kWh beyond the included quota at $5/kWh", () => {
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 16.0161,
        kwh_remaining: 0,
        in_overage: true,
      },
      limits: { overage_limit_usd: 10, rate_limit_tier: "standard" },
    });

    const p = computeOverageProgress(quotas);
    expect(p.overageKwh).toBeCloseTo(0.0161, 4);
    expect(p.rate).toBe(5);
    expect(p.costUsd).toBeCloseTo(0.0805, 4);
    expect(p.capUsd).toBe(10);
    expect(p.remainingUsd).toBeCloseTo(9.9195, 4);
    expect(p.pctRemaining).toBeCloseTo(99.2, 1);
    expect(p.exhausted).toBe(false);
  });

  it("subscribed: marks cap exhausted when overage cost reaches the cap", () => {
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 18.1, // 2.1 kWh over * $5 = $10.50, over the $10 cap
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    const p = computeOverageProgress(quotas);
    expect(p.costUsd).toBeCloseTo(10.5, 2);
    expect(p.remainingUsd).toBe(0);
    expect(p.pctRemaining).toBe(0);
    expect(p.exhausted).toBe(true);
  });

  it("unsubscribed: bills all monthly usage at $10/kWh", () => {
    const quotas = baseQuotas({
      subscription: null,
      usage: {
        lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
        current_month: {
          cost_usd: 0,
          requests: 0,
          tokens: 0,
          energy_kwh: 0.5,
        },
      },
      limits: { overage_limit_usd: 10, rate_limit_tier: "standard" },
    });

    const p = computeOverageProgress(quotas);
    expect(p.overageKwh).toBeCloseTo(0.5, 4);
    expect(p.rate).toBe(10);
    expect(p.costUsd).toBeCloseTo(5, 4);
    expect(p.remainingUsd).toBeCloseTo(5, 4);
    expect(p.exhausted).toBe(false);
  });

  it("returns capUsd 0 and pct 0 when there is no cap", () => {
    const quotas = baseQuotas({
      limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    });
    const p = computeOverageProgress(quotas);
    expect(p.capUsd).toBe(0);
    expect(p.pctRemaining).toBe(0);
    expect(p.exhausted).toBe(false);
  });
});

describe("checkQuotas warning staging", () => {
  it("warns on energy when subscribed and kWh is low", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_remaining: 2,
        kwh_used: 14,
        in_overage: false,
      },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Energy:");
    expect(ctx.calls[0]).toContain("13%");
  });

  it("warns on overage cap progress when subscribed and in overage with a cap", () => {
    clearAlertState();
    const ctx = mockCtx();
    // 0.4 kWh * $5 = $2 used, $8 of $10 remaining = 80%.
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 16.4,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Overage cap:");
    expect(ctx.calls[0]).toContain("80%");
    expect(ctx.calls[0]).toContain("$8.00");
    expect(ctx.calls[0]).toContain("$10.00");
    expect(ctx.calls[0]).toContain("@ $5.00/kWh");
    // 0.4 kWh renders as Wh via formatKwh.
    expect(ctx.calls[0]).toContain("400.0 Wh over");
    // Credits are unreachable while a cap is set and not exhausted.
    expect(ctx.calls[0]).not.toContain("Credits:");
  });

  it("falls through to credits when subscribed overage cap is exhausted", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      balance: {
        credits_remaining_usd: 3,
        total_credits_usd: 30,
        credits_used_usd: 27,
        accounting_method: "energy",
      },
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 18.1, // exhausted
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Credits:");
    expect(ctx.calls[0]).toContain("10%");
    expect(ctx.calls[0]).not.toContain("Overage cap:");
  });

  it("falls through to credits when subscribed, in overage with no cap", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      balance: {
        credits_remaining_usd: 3,
        total_credits_usd: 30,
        credits_used_usd: 27,
        accounting_method: "energy",
      },
      subscription: {
        ...subFixture(),
        kwh_remaining: 0,
        kwh_used: 16,
        in_overage: true,
      },
      limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Credits:");
  });

  it("warns on overage cap progress when unsubscribed with a cap and low %", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: null,
      usage: {
        lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
        current_month: {
          cost_usd: 0,
          requests: 0,
          tokens: 0,
          energy_kwh: 0.8, // 0.8 * $10 = $8, $2 of $10 remaining = 20%
        },
      },
      limits: { overage_limit_usd: 10, rate_limit_tier: "standard" },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Overage cap:");
    expect(ctx.calls[0]).toContain("20%");
    expect(ctx.calls[0]).toContain("@ $10.00/kWh");
    // 0.8 kWh renders as Wh via formatKwh.
    expect(ctx.calls[0]).toContain("800.0 Wh over");
  });

  it("stays silent when unsubscribed with a cap but healthy %", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: null,
      usage: {
        lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
        current_month: {
          cost_usd: 0,
          requests: 0,
          tokens: 0,
          energy_kwh: 0.1, // $1 of $10 = 90% remaining
        },
      },
      limits: { overage_limit_usd: 10, rate_limit_tier: "standard" },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(0);
  });

  it("warns on credits when there is no subscription and no cap", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: null,
      limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
      balance: {
        credits_remaining_usd: 2,
        total_credits_usd: 20,
        credits_used_usd: 18,
        accounting_method: "token",
      },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Credits:");
    expect(ctx.calls[0]).toContain("10%");
  });

  it("does not re-fire the overage warning within cooldown", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 16.4,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    checkQuotas(ctx, quotas);
    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(1);
  });

  it("uses critical (error) level for overage", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 16.4,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls[0].startsWith("error:")).toBe(true);
  });

  it("stays silent when subscribed, in overage with no cap, and credits healthy", () => {
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_remaining: 0,
        kwh_used: 16,
        in_overage: true,
      },
      limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
      balance: {
        credits_remaining_usd: 35,
        total_credits_usd: 35,
        credits_used_usd: 0,
        accounting_method: "energy",
      },
    });

    checkQuotas(ctx, quotas);

    expect(ctx.calls).toHaveLength(0);
  });
});
