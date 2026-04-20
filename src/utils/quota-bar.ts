import type { Theme } from "@mariozechner/pi-coding-agent";

export type Severity = "success" | "warning" | "error";

export function severityFromPercent(pct: number): Severity {
  if (pct > 50) return "success";
  if (pct > 20) return "warning";
  return "error";
}

export type BarStyle = "filled-used" | "filled-remaining";

/**
 * Render a progress bar.
 *
 * filled-used: filled region = used portion (colored by severity of remaining%)
 * filled-remaining: filled region = remaining portion (colored by severity of remaining%)
 */
export function renderProgressBar(
  percent: number,
  width: number,
  theme: Theme,
  severity: Severity,
  style: BarStyle = "filled-remaining",
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filledCount = Math.round((clamped / 100) * width);

  const parts: string[] = [];
  for (let idx = 0; idx < width; idx++) {
    const isFilled = idx < filledCount;
    if (style === "filled-used") {
      // filled = used (severity color), empty = remaining (dim)
      parts.push(
        isFilled ? theme.fg(severity, "\u2593") : theme.fg("success", "\u2591"),
      );
    } else {
      // filled = remaining (severity color), empty = used (dim)
      parts.push(
        isFilled ? theme.fg(severity, "\u2588") : theme.fg("dim", "\u2591"),
      );
    }
  }
  return parts.join("");
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
