import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import { formatKwh, formatUsd } from "../../src/utils/quota-format";

export type WarningSeverity = "warning" | "critical";

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes
const LOW_PCT = 25;
const CRITICAL_PCT = 10;

/** Per-kWh price once a subscription's included kWh are exhausted. */
const OVERAGE_RATE_PER_KWH_SUBSCRIBED = 5;
/** Per-kWh price when there is no active subscription (no included kWh). */
const OVERAGE_RATE_PER_KWH_UNSUBSCRIBED = 10;

interface AlertState {
  lastSeverity: WarningSeverity;
  lastNotifiedAt: number;
}

// Module-level state so cooldowns survive across invocations of checkQuotas()
// within the same Pi runtime.
const alerts = new Map<string, AlertState>();

export function clearAlertState(): void {
  alerts.clear();
}

function severityForPct(pct: number): WarningSeverity {
  return pct <= CRITICAL_PCT ? "critical" : "warning";
}

function shouldNotify(key: string, severity: WarningSeverity): boolean {
  const state = alerts.get(key);
  if (!state) return true;

  const order: WarningSeverity[] = ["warning", "critical"];
  if (order.indexOf(severity) > order.indexOf(state.lastSeverity)) return true;

  return Date.now() - state.lastNotifiedAt >= COOLDOWN_MS;
}

function markNotified(key: string, severity: WarningSeverity): void {
  alerts.set(key, { lastSeverity: severity, lastNotifiedAt: Date.now() });
}

interface PendingWarning {
  key: string;
  severity: WarningSeverity;
  message: string;
}

/** Subscription energy (kWh) — the primary billing pool while subscribed. */
function energyWarning(
  sub: NonNullable<NeuralwattQuotas["subscription"]>,
): PendingWarning | undefined {
  if (sub.kwh_included <= 0) return;
  const pct = (sub.kwh_remaining / sub.kwh_included) * 100;
  if (pct > LOW_PCT) return;
  return {
    key: "energy",
    severity: severityForPct(pct),
    message: `Energy: ${pct.toFixed(0)}% remaining (${formatKwh(sub.kwh_remaining)} of ${formatKwh(sub.kwh_included)})`,
  };
}

/** Balance credits (USD) — on-demand top-up pool. */
function creditsWarning(quotas: NeuralwattQuotas): PendingWarning | undefined {
  const { credits_remaining_usd, total_credits_usd } = quotas.balance;
  if (total_credits_usd <= 0) return;
  const pct = (credits_remaining_usd / total_credits_usd) * 100;
  if (pct > LOW_PCT) return;
  return {
    key: "credits",
    severity: severityForPct(pct),
    message: `Credits: ${pct.toFixed(0)}% remaining (${formatUsd(credits_remaining_usd)} of ${formatUsd(total_credits_usd)})`,
  };
}

/** Overage usage billed against the overage cap, derived from kWh usage. */
interface OverageProgress {
  /** kWh billed at the overage rate. */
  overageKwh: number;
  /** Per-kWh rate applied (USD). */
  rate: number;
  /** Cost of the overage kWh so far (USD). */
  costUsd: number;
  /** Configured overage cap (USD), or 0 when none. */
  capUsd: number;
  /** Remaining cap headroom (USD), clamped at 0. */
  remainingUsd: number;
  /** Remaining cap as a percentage of the cap (0-100). 0 when no cap. */
  pctRemaining: number;
  /** Cap exhausted (overage cost has reached or passed the cap). */
  exhausted: boolean;
}

export function computeOverageProgress(
  quotas: NeuralwattQuotas,
): OverageProgress {
  const capUsd = quotas.limits.overage_limit_usd ?? 0;
  const hasSub = quotas.subscription !== null;

  // Subscribed: only kWh beyond the included quota are billed at the overage
  // rate. Unsubscribed: every kWh is billable — the monthly usage total is the
  // overage pool (there is no included quota to subtract from).
  const overageKwh = hasSub
    ? Math.max(
        0,
        (quotas.subscription?.kwh_used ?? 0) -
          (quotas.subscription?.kwh_included ?? 0),
      )
    : quotas.usage.current_month.energy_kwh;

  const rate = hasSub
    ? OVERAGE_RATE_PER_KWH_SUBSCRIBED
    : OVERAGE_RATE_PER_KWH_UNSUBSCRIBED;
  const costUsd = overageKwh * rate;
  const remainingUsd = Math.max(0, capUsd - costUsd);
  const pctRemaining = capUsd > 0 ? (remainingUsd / capUsd) * 100 : 0;

  return {
    overageKwh,
    rate,
    costUsd,
    capUsd,
    remainingUsd,
    pctRemaining,
    exhausted: capUsd > 0 && remainingUsd <= 0,
  };
}

function overageWarning(progress: OverageProgress): PendingWarning {
  const pct = Math.max(0, Math.min(100, progress.pctRemaining));
  return {
    key: "overage",
    // Entering overage is itself worth a critical alert; the % controls the
    // message, not whether we notify.
    severity: "critical",
    message: `Overage cap: ${pct.toFixed(0)}% remaining (${formatUsd(progress.remainingUsd)} of ${formatUsd(progress.capUsd)}, ${formatKwh(progress.overageKwh)} over @ ${formatUsd(progress.rate)}/kWh)`,
  };
}

/**
 * Warning progression mirrors Neuralwatt's billing order. Each stage uses its
 * own alert key, so once a later stage starts the earlier one stops — the
 * warning "moves on" instead of re-reporting a depleted pool forever.
 *
 *   subscribed, not in overage          → energy (kWh remaining of quota)
 *   subscribed, in overage, cap set      → overage cap progress (credits unreachable)
 *   subscribed, in overage, cap exhausted→ balance credits
 *   subscribed, in overage, no cap      → balance credits (overage draws them down)
 *   no subscription, cap set            → overage cap progress (all kWh billable)
 *   no subscription, no cap             → balance credits
 *
 * Overage cost is derived from kWh usage: subscribed pays $5/kWh for kWh
 * beyond the included quota; unsubscribed pays $10/kWh for all usage. There is
 * no overage-spent counter in the API, so progress is computed.
 *
 * Usage totals (monthly/lifetime cost in USD) are deliberately not used as a
 * threshold basis — they are not directly tied to the subscription's kWh quota.
 */
export function checkQuotas(
  ctx: ExtensionContext,
  quotas: NeuralwattQuotas,
): void {
  if (!ctx.hasUI) return;

  const pending: PendingWarning[] = [];
  const sub = quotas.subscription;

  if (sub?.in_overage) {
    const cap = quotas.limits.overage_limit_usd;
    if (cap !== null && cap > 0) {
      const progress = computeOverageProgress(quotas);
      if (progress.exhausted) {
        // Cap spent — fall through to the balance credits.
        const cw = creditsWarning(quotas);
        if (cw) pending.push(cw);
      } else {
        pending.push(overageWarning(progress));
      }
    } else {
      // No cap: overage spends down the balance credits directly.
      const cw = creditsWarning(quotas);
      if (cw) pending.push(cw);
    }
  } else if (sub) {
    const ew = energyWarning(sub);
    if (ew) pending.push(ew);
  } else {
    // No subscription. All kWh bill at the unsubscribed rate; warn on the
    // overage cap when one is set, otherwise on the balance credits.
    const cap = quotas.limits.overage_limit_usd;
    if (cap !== null && cap > 0) {
      const progress = computeOverageProgress(quotas);
      if (progress.exhausted) {
        const cw = creditsWarning(quotas);
        if (cw) pending.push(cw);
      } else if (progress.pctRemaining <= LOW_PCT) {
        pending.push(overageWarning(progress));
      }
    } else {
      const cw = creditsWarning(quotas);
      if (cw) pending.push(cw);
    }
  }

  const fired = pending.filter((w) => {
    if (shouldNotify(w.key, w.severity)) {
      markNotified(w.key, w.severity);
      return true;
    }
    return false;
  });

  if (fired.length === 0) return;

  const hasCritical = fired.some((w) => w.severity === "critical");
  ctx.ui.notify(
    `Neuralwatt quota warning:\n${fired.map((w) => `  - ${w.message}`).join("\n")}`,
    hasCritical ? "error" : "warning",
  );
}
