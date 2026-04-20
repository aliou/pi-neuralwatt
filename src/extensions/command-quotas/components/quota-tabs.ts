import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { NeuralwattQuotas } from "../../../types/quota-api";
import {
  percentCreditsRemaining,
  percentEnergyRemaining,
  renderProgressBar,
  severityFromPercent,
} from "../../../utils/quota-bar";
import {
  formatKwh,
  formatTokens,
  formatUsd,
} from "../../../utils/quota-format";

/**
 * Subscription tab — plan details, energy quota, billing period.
 * Shown only when an active subscription exists.
 */
export function renderSubscriptionTab(
  quotas: NeuralwattQuotas,
  contentWidth: number,
  maxWidth: number,
  theme: Theme,
): string[] {
  const sub = quotas.subscription;
  if (!sub) return [];
  const lines: string[] = [];
  const barWidth = Math.min(40, Math.max(20, contentWidth - 30));

  // --- Plan info ---
  lines.push("");
  lines.push(
    truncateToWidth(`  ${theme.fg("accent", theme.bold("Plan"))}`, maxWidth),
  );
  lines.push(labelValue("Name", sub.plan, maxWidth, theme));
  lines.push(labelValue("Status", sub.status, maxWidth, theme));
  lines.push(
    labelValue("Billing", sub.billing_interval ?? "\u2014", maxWidth, theme),
  );
  lines.push(
    labelValue("Auto-renew", sub.auto_renew ? "yes" : "no", maxWidth, theme),
  );

  // --- Energy quota ---
  lines.push("");
  lines.push(
    truncateToWidth(
      `  ${theme.fg("accent", theme.bold("Energy Quota"))}`,
      maxWidth,
    ),
  );
  const energyPct = percentEnergyRemaining(sub);
  const energyColor = severityFromPercent(energyPct);
  const energyBar = renderProgressBar(energyPct, barWidth, theme, energyColor);
  lines.push(
    truncateToWidth(
      `  ${energyBar} ${theme.fg(energyColor, `${energyPct}%`)}`,
      maxWidth,
    ),
  );
  lines.push(
    labelValue(
      "Remaining",
      `${formatKwh(sub.kwh_remaining)} of ${formatKwh(sub.kwh_included)}`,
      maxWidth,
      theme,
    ),
  );
  lines.push(labelValue("Used", formatKwh(sub.kwh_used), maxWidth, theme));

  if (sub.in_overage) {
    lines.push(
      truncateToWidth(
        `  ${theme.fg("error", "In overage \u2014 pay-per-use rates apply")}`,
        maxWidth,
      ),
    );
  }

  // --- Billing period ---
  lines.push("");
  lines.push(
    truncateToWidth(
      `  ${theme.fg("accent", theme.bold("Billing Period"))}`,
      maxWidth,
    ),
  );
  const start = sub.current_period_start?.slice(0, 10) ?? "\u2014";
  const end = sub.current_period_end?.slice(0, 10) ?? "\u2014";
  lines.push(labelValue("Start", start, maxWidth, theme));
  lines.push(labelValue("End", end, maxWidth, theme));

  return lines;
}

/**
 * Credits tab — credit balance only.
 */
export function renderCreditsTab(
  quotas: NeuralwattQuotas,
  contentWidth: number,
  maxWidth: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const barWidth = Math.min(40, Math.max(20, contentWidth - 30));

  // --- Credit balance ---
  lines.push("");
  lines.push(
    truncateToWidth(`  ${theme.fg("accent", theme.bold("Credits"))}`, maxWidth),
  );
  const creditsPct = percentCreditsRemaining(quotas);
  const creditsColor = severityFromPercent(creditsPct);
  const creditsBar = renderProgressBar(
    creditsPct,
    barWidth,
    theme,
    creditsColor,
  );
  lines.push(
    truncateToWidth(
      `  ${creditsBar} ${theme.fg(creditsColor, `${creditsPct}%`)}`,
      maxWidth,
    ),
  );
  lines.push(
    labelValue(
      "Remaining",
      `${formatUsd(quotas.balance.credits_remaining_usd)} of ${formatUsd(quotas.balance.total_credits_usd)}`,
      maxWidth,
      theme,
    ),
  );
  lines.push(
    labelValue(
      "Used",
      formatUsd(quotas.balance.credits_used_usd),
      maxWidth,
      theme,
    ),
  );
  lines.push(
    labelValue("Accounting", quotas.balance.accounting_method, maxWidth, theme),
  );

  return lines;
}

/**
 * Usage & Key tab — usage this month, API key info, key allowance, rate limits.
 * Shared data that doesn't belong exclusively to subscription or credits.
 */
export function renderUsageKeyTab(
  quotas: NeuralwattQuotas,
  _contentWidth: number,
  maxWidth: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  // --- Usage this month ---
  lines.push("");
  lines.push(
    truncateToWidth(
      `  ${theme.fg("accent", theme.bold("Usage (this month)"))}`,
      maxWidth,
    ),
  );
  const usage = quotas.usage.current_month;
  lines.push(labelValue("Cost", formatUsd(usage.cost_usd), maxWidth, theme));
  lines.push(
    labelValue("Requests", usage.requests.toLocaleString(), maxWidth, theme),
  );
  lines.push(labelValue("Tokens", formatTokens(usage.tokens), maxWidth, theme));
  lines.push(
    labelValue("Energy", formatKwh(usage.energy_kwh), maxWidth, theme),
  );

  // --- API Key ---
  lines.push("");
  lines.push(
    truncateToWidth(`  ${theme.fg("accent", theme.bold("API Key"))}`, maxWidth),
  );
  lines.push(
    labelValue("Name", quotas.key.name || "(unnamed)", maxWidth, theme),
  );

  // --- Key allowance ---
  if (quotas.key.allowance) {
    lines.push("");
    lines.push(
      truncateToWidth(
        `  ${theme.fg("accent", theme.bold("Key Allowance"))}`,
        maxWidth,
      ),
    );
    const alw = quotas.key.allowance;
    lines.push(labelValue("Limit", formatUsd(alw.limit_usd), maxWidth, theme));
    lines.push(labelValue("Spent", formatUsd(alw.spent_usd), maxWidth, theme));
    lines.push(
      labelValue("Remaining", formatUsd(alw.remaining_usd), maxWidth, theme),
    );
    lines.push(labelValue("Period", alw.period, maxWidth, theme));
    if (alw.blocked) {
      lines.push(
        truncateToWidth(
          `  ${theme.fg("error", "BLOCKED \u2014 spending limit reached")}`,
          maxWidth,
        ),
      );
    }
  }

  // --- Rate Limits ---
  lines.push("");
  lines.push(
    truncateToWidth(
      `  ${theme.fg("accent", theme.bold("Rate Limits"))}`,
      maxWidth,
    ),
  );
  lines.push(
    labelValue("Tier", quotas.limits.rate_limit_tier, maxWidth, theme),
  );
  lines.push(
    labelValue(
      "Overage cap",
      quotas.limits.overage_limit_usd !== null
        ? formatUsd(quotas.limits.overage_limit_usd)
        : "none",
      maxWidth,
      theme,
    ),
  );

  return lines;
}

/** Format a label: value pair with aligned labels. */
function labelValue(
  label: string,
  value: string,
  maxWidth: number,
  theme: Theme,
): string {
  const labelWidth = 14;
  const padded = label.padEnd(labelWidth);
  return truncateToWidth(`  ${theme.fg("dim", padded)} ${value}`, maxWidth);
}
