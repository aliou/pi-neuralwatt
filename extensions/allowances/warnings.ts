import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ResolvedNeuralwattConfig } from "../../src/config";
import type { NeuralwattAllowancesUpdatedPayload } from "../../src/events";
import { formatUsd } from "../../src/utils/quota-format";

type AllowanceWarningsConfig =
  ResolvedNeuralwattConfig["allowances"]["warnings"];

const warnedThresholdsBySession = new Map<string, Set<number>>();

export function clearAllowanceWarningState(): void {
  warnedThresholdsBySession.clear();
}

function remainingPercent(
  snapshot: NeuralwattAllowancesUpdatedPayload,
): number | undefined {
  if (snapshot.sessionAllowanceRemainingUsd === null) return;
  const total =
    snapshot.sessionSpentUsd + snapshot.sessionAllowanceRemainingUsd;
  if (total <= 0) return;
  return (snapshot.sessionAllowanceRemainingUsd / total) * 100;
}

function normalizeThresholds(thresholds: number[]): number[] {
  return [...new Set(thresholds)]
    .filter((threshold) => threshold > 0 && threshold <= 100)
    .sort((a, b) => b - a);
}

export function checkAllowanceWarnings(
  ctx: ExtensionContext,
  snapshot: NeuralwattAllowancesUpdatedPayload,
  config: AllowanceWarningsConfig,
): void {
  if (!ctx.hasUI) return;
  if (!config.enabled) return;

  const pct = remainingPercent(snapshot);
  if (pct === undefined) return;

  const thresholds = normalizeThresholds(config.remainingThresholds);
  if (thresholds.length === 0) return;

  const warned = warnedThresholdsBySession.get(snapshot.sessionId) ?? new Set();
  const crossed = thresholds.filter(
    (threshold) => pct <= threshold && !warned.has(threshold),
  );
  if (crossed.length === 0) return;

  for (const threshold of crossed) warned.add(threshold);
  warnedThresholdsBySession.set(snapshot.sessionId, warned);

  const activeThreshold = Math.min(...crossed);
  const level = activeThreshold <= 10 ? "error" : "warning";
  ctx.ui.notify(
    `Neuralwatt session allowance warning:\n  - ${pct.toFixed(0)}% remaining (${formatUsd(
      snapshot.sessionAllowanceRemainingUsd ?? 0,
    )} remaining; ${formatUsd(snapshot.sessionSpentUsd)} spent)`,
    level,
  );
}
