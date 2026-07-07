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
