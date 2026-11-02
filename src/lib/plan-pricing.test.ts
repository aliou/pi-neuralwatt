import { describe, expect, it } from "vitest";
import {
  PAYG_RATE_PER_KWH,
  PLAN_PRICING,
  planPricing,
  resolveOverageRate,
} from "./plan-pricing";

const EPSILON = 0.01;

describe("PLAN_PRICING", () => {
  it("prices each plan's included kWh at its overage rate", () => {
    for (const pricing of Object.values(PLAN_PRICING)) {
      const derived = pricing.priceMonthlyUsd / pricing.overageMonthlyPerKwh;
      expect(Math.abs(pricing.kwhIncluded - derived)).toBeLessThan(EPSILON);
    }
  });

  it("charges annual overage at the monthly rate times 10/12", () => {
    for (const pricing of Object.values(PLAN_PRICING)) {
      const derived = (pricing.overageMonthlyPerKwh * 10) / 12;
      expect(Math.abs(pricing.overageAnnualPerKwh - derived)).toBeLessThan(
        EPSILON,
      );
    }
  });
});

describe("planPricing", () => {
  it("resolves case-insensitively", () => {
    expect(planPricing("Max")?.priceMonthlyUsd).toBe(200);
    expect(planPricing("MAX")).toBe(planPricing("max"));
  });

  it("returns undefined for unknown plans", () => {
    expect(planPricing("enterprise")).toBeUndefined();
  });
});

describe("resolveOverageRate", () => {
  it("uses the unsubscribed rate without a subscription", () => {
    expect(resolveOverageRate(null)).toBe(PAYG_RATE_PER_KWH);
    expect(resolveOverageRate(undefined)).toBe(PAYG_RATE_PER_KWH);
  });

  it("picks the rate by billing interval", () => {
    const sub = { plan: "max", billing_interval: "month" } as const;
    expect(resolveOverageRate(sub)).toBe(7.0);
    expect(resolveOverageRate({ ...sub, billing_interval: "year" })).toBe(5.83);
  });

  it("falls back to the Standard monthly rate for unknown plans", () => {
    expect(
      resolveOverageRate({ plan: "enterprise", billing_interval: "month" }),
    ).toBe(PLAN_PRICING.standard.overageMonthlyPerKwh);
    expect(
      resolveOverageRate({ plan: "enterprise", billing_interval: "year" }),
    ).toBe(PLAN_PRICING.standard.overageMonthlyPerKwh);
  });
});
