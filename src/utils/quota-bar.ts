import type { NeuralwattDailyFreeEnergy } from "../types/quota-api";

export type Severity = "success" | "warning" | "error";

export function severityFromPercent(pct: number): Severity {
  if (pct > 50) return "success";
  if (pct > 20) return "warning";
  return "error";
}

export function percentCreditsRemaining(quotas: {
  balance: { credits_remaining_usd: number; total_credits_usd: number };
}): number {
  const { credits_remaining_usd, total_credits_usd } = quotas.balance;
  if (total_credits_usd === 0) return 0;
  return Math.round((credits_remaining_usd / total_credits_usd) * 100);
}

export function percentEnergyRemaining(sub: {
  kwh_included: number;
  kwh_remaining: number;
}): number {
  if (sub.kwh_included === 0) return 0;
  return Math.round((sub.kwh_remaining / sub.kwh_included) * 100);
}

export function percentFreeEnergyRemaining(
  block: Pick<NeuralwattDailyFreeEnergy, "kwh_included" | "kwh_remaining">,
): number {
  if (block.kwh_included === 0) return 0;
  return Math.round((block.kwh_remaining / block.kwh_included) * 100);
}

/** True when the block's reset instant has passed without a refresh. */
export function isFreeEnergyStale(
  block: Pick<NeuralwattDailyFreeEnergy, "reset_at">,
  now: number = Date.now(),
): boolean {
  return Date.parse(block.reset_at) <= now;
}
