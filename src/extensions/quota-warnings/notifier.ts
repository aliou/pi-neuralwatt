import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { NeuralwattQuotas } from "../../types/quota-api";
import { formatKwh, formatUsd } from "../../utils/quota-format";

export type WarningSeverity = "warning" | "critical";

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

interface AlertState {
  lastSeverity: WarningSeverity;
  lastNotifiedAt: number;
}

const alerts = new Map<string, AlertState>();

export function clearAlertState(): void {
  alerts.clear();
}

function shouldNotify(key: string, severity: WarningSeverity): boolean {
  const state = alerts.get(key);
  if (!state) return true;

  const order: WarningSeverity[] = ["warning", "critical"];
  if (order.indexOf(severity) > order.indexOf(state.lastSeverity)) return true;

  if (severity === "critical") return true;

  return Date.now() - state.lastNotifiedAt >= COOLDOWN_MS;
}

function markNotified(key: string, severity: WarningSeverity): void {
  alerts.set(key, { lastSeverity: severity, lastNotifiedAt: Date.now() });
}

/**
 * When a subscription is active, energy is the primary billing method.
 * Credits are on-demand/top-up only — don't warn for credits when subscribed.
 */
export function checkQuotas(
  ctx: ExtensionContext,
  quotas: NeuralwattQuotas,
  skipAlreadyWarned: boolean,
): void {
  if (!ctx.hasUI) return;

  const warnings: string[] = [];
  const hasSub = quotas.subscription !== null;

  // Credits warning — only when no active subscription
  if (!hasSub) {
    const { credits_remaining_usd, total_credits_usd } = quotas.balance;
    if (total_credits_usd > 0) {
      const pct = (credits_remaining_usd / total_credits_usd) * 100;
      if (pct <= 25) {
        const severity: WarningSeverity = pct <= 10 ? "critical" : "warning";
        const key = "credits";
        if (!skipAlreadyWarned || shouldNotify(key, severity)) {
          markNotified(key, severity);
          warnings.push(
            `Credits: ${pct.toFixed(0)}% remaining (${formatUsd(credits_remaining_usd)} of ${formatUsd(total_credits_usd)})`,
          );
        }
      }
    }
  }

  // Subscription energy check
  if (quotas.subscription) {
    const { kwh_included, kwh_remaining, in_overage } = quotas.subscription;
    if (kwh_included > 0) {
      const pct = (kwh_remaining / kwh_included) * 100;
      if (in_overage || pct <= 25) {
        const severity: WarningSeverity = in_overage
          ? "critical"
          : pct <= 10
            ? "critical"
            : "warning";
        const key = "energy";
        if (!skipAlreadyWarned || shouldNotify(key, severity)) {
          markNotified(key, severity);
          const tag = in_overage ? " [OVERAGE]" : "";
          warnings.push(
            `Energy${tag}: ${pct.toFixed(0)}% remaining (${formatKwh(kwh_remaining)} of ${formatKwh(kwh_included)})`,
          );
        }
      }
    }
  }

  if (warnings.length === 0) return;

  const hasCritical = warnings.some((w) => w.includes("[OVERAGE]"));
  ctx.ui.notify(
    `Neuralwatt quota warning:\n${warnings.map((w) => `  - ${w}`).join("\n")}`,
    hasCritical ? "error" : "warning",
  );
}
