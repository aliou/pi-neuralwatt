import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import {
  checkQuotas,
  clearAlertState,
  computeOverageProgress,
  type FreeEnergyWarningsConfig,
} from "./notifier";

const FREE_ENERGY: FreeEnergyWarningsConfig = { enabled: true, warningPct: 20 };

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

function freeEnergyBlock(
  overrides: Partial<NonNullable<NeuralwattQuotas["daily_free_energy"]>> = {},
): NonNullable<NeuralwattQuotas["daily_free_energy"]> {
  return {
    kwh_included: 0.825,
    kwh_used: 0.7425,
    kwh_remaining: 0.0825,
    reset_at: "2026-11-15T00:00:00Z",
    model_labels: ["DeepSeek-V4.1-Flash", "GLM-5.3-Flash"],
    ...overrides,
  };
}

describe("checkQuotas daily free energy", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearAlertState();
  });

  it("warns when the daily allowance drops to the threshold", () => {
    vi.setSystemTime("2026-11-14T10:00:00Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({ daily_free_energy: freeEnergyBlock() });

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Daily free energy:");
    expect(ctx.calls[0]).toContain("10%");
    expect(ctx.calls[0]).toContain("82.5 Wh of 825.0 Wh");
    expect(ctx.calls[0]).not.toContain("Energy:");
  });

  it("goes critical when the daily allowance is exhausted", () => {
    vi.setSystemTime("2026-11-14T10:00:00Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      daily_free_energy: freeEnergyBlock({
        kwh_used: 0.825,
        kwh_remaining: 0,
      }),
    });

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0].startsWith("error:")).toBe(true);
    expect(ctx.calls[0]).toContain("Daily free energy exhausted");
  });

  it("stays silent above the threshold", () => {
    vi.setSystemTime("2026-11-14T10:00:00Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      daily_free_energy: freeEnergyBlock({
        kwh_used: 0.1,
        kwh_remaining: 0.725,
      }),
    });

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(0);
  });

  it("stays silent when disabled", () => {
    vi.setSystemTime("2026-11-14T10:00:00Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      daily_free_energy: freeEnergyBlock(),
      subscription: {
        ...subFixture(),
        kwh_remaining: 2,
        kwh_used: 14,
      },
    });

    checkQuotas(ctx, quotas, { enabled: false, warningPct: 20 });

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Energy:");
  });

  it("stays silent on a stale block and reports the fallback stage", () => {
    vi.setSystemTime("2026-11-15T00:00:01Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({
      daily_free_energy: freeEnergyBlock(),
      subscription: {
        ...subFixture(),
        kwh_remaining: 2,
        kwh_used: 14,
      },
    });

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Energy:");
    expect(ctx.calls[0]).not.toContain("Daily free energy");
  });

  it("re-arms after UTC rollover", () => {
    vi.setSystemTime("2026-11-14T23:59:00Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({ daily_free_energy: freeEnergyBlock() });

    checkQuotas(ctx, quotas, FREE_ENERGY);
    expect(ctx.calls).toHaveLength(1);

    vi.setSystemTime("2026-11-15T00:01:00Z");
    const nextDay = baseQuotas({
      daily_free_energy: freeEnergyBlock({
        reset_at: "2026-11-16T00:00:00Z",
      }),
    });
    checkQuotas(ctx, nextDay, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(2);
  });

  it("does not re-fire within cooldown on the same day", () => {
    vi.setSystemTime("2026-11-14T10:00:00Z");
    clearAlertState();
    const ctx = mockCtx();
    const quotas = baseQuotas({ daily_free_energy: freeEnergyBlock() });

    checkQuotas(ctx, quotas, FREE_ENERGY);
    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(1);
  });
});

describe("computeOverageProgress", () => {
  it("subscribed: bills kWh beyond the included quota at the plan's monthly rate", () => {
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
    expect(p.rate).toBe(8);
    expect(p.costUsd).toBeCloseTo(0.1288, 4);
    expect(p.capUsd).toBe(10);
    expect(p.remainingUsd).toBeCloseTo(9.8712, 4);
    expect(p.pctRemaining).toBeCloseTo(98.7, 1);
    expect(p.exhausted).toBe(false);
  });

  it("subscribed: max plan on a monthly interval bills at $7.00/kWh", () => {
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        plan: "max",
        kwh_included: 16,
        kwh_used: 17,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    const p = computeOverageProgress(quotas);
    expect(p.rate).toBe(7);
    expect(p.costUsd).toBeCloseTo(7, 4);
  });

  it("subscribed: standard plan on an annual interval bills at $6.67/kWh", () => {
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        plan: "standard",
        billing_interval: "year",
        kwh_included: 16,
        kwh_used: 17,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    const p = computeOverageProgress(quotas);
    expect(p.rate).toBe(6.67);
    expect(p.costUsd).toBeCloseTo(6.67, 4);
  });

  it("subscribed: unknown plan falls back to the Standard monthly rate", () => {
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        plan: "enterprise",
        kwh_included: 16,
        kwh_used: 17,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    const p = computeOverageProgress(quotas);
    expect(p.rate).toBe(8);
  });

  it("subscribed: marks cap exhausted when overage cost reaches the cap", () => {
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 17.3125, // 1.3125 kWh over * $8 = $10.50, over the $10 cap
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

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Energy:");
    expect(ctx.calls[0]).toContain("13%");
  });

  it("warns on overage cap progress when subscribed and in overage with a cap", () => {
    clearAlertState();
    const ctx = mockCtx();
    // 0.4 kWh * $8 = $3.20 used, $6.80 of $10 remaining = 68%.
    const quotas = baseQuotas({
      subscription: {
        ...subFixture(),
        kwh_included: 16,
        kwh_used: 16.4,
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toContain("Overage cap:");
    expect(ctx.calls[0]).toContain("68%");
    expect(ctx.calls[0]).toContain("$6.80");
    expect(ctx.calls[0]).toContain("$10.00");
    expect(ctx.calls[0]).toContain("@ $8.00/kWh");
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
        kwh_used: 17.3125, // exhausted
        kwh_remaining: 0,
        in_overage: true,
      },
    });

    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);
    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);

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

    checkQuotas(ctx, quotas, FREE_ENERGY);

    expect(ctx.calls).toHaveLength(0);
  });
});
