export interface PlanPricing {
  priceMonthlyUsd: number;
  kwhIncluded: number;
  overageMonthlyPerKwh: number;
  overageAnnualPerKwh: number;
}

export const PAYG_RATE_PER_KWH = 10;

const UNKNOWN_PLAN = "standard";

export const PLAN_PRICING = {
  basic: {
    priceMonthlyUsd: 20,
    kwhIncluded: 2.35,
    overageMonthlyPerKwh: 8.5,
    overageAnnualPerKwh: 7.08,
  },
  standard: {
    priceMonthlyUsd: 50,
    kwhIncluded: 6.25,
    overageMonthlyPerKwh: 8.0,
    overageAnnualPerKwh: 6.67,
  },
  pro: {
    priceMonthlyUsd: 100,
    kwhIncluded: 13.33,
    overageMonthlyPerKwh: 7.5,
    overageAnnualPerKwh: 6.25,
  },
  max: {
    priceMonthlyUsd: 200,
    kwhIncluded: 28.57,
    overageMonthlyPerKwh: 7.0,
    overageAnnualPerKwh: 5.83,
  },
} as const satisfies Record<string, PlanPricing>;

export type PlanName = keyof typeof PLAN_PRICING;

export function planPricing(plan: string): PlanPricing | undefined {
  return PLAN_PRICING[plan.toLowerCase() as PlanName];
}

export function resolveOverageRate(
  sub:
    | {
        plan: string;
        billing_interval: string;
      }
    | null
    | undefined,
): number {
  if (!sub) return PAYG_RATE_PER_KWH;
  const pricing = planPricing(sub.plan);
  if (!pricing) return PLAN_PRICING[UNKNOWN_PLAN].overageMonthlyPerKwh;
  return sub.billing_interval === "year"
    ? pricing.overageAnnualPerKwh
    : pricing.overageMonthlyPerKwh;
}
