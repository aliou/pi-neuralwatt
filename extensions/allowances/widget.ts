import type { ResolvedNeuralwattConfig } from "../../src/config";
import type { NeuralwattAllowancesUpdatedPayload } from "../../src/events";
import { formatUsd } from "../../src/utils/quota-format";

type AllowanceConfig = ResolvedNeuralwattConfig["allowances"];

export const ALLOWANCE_WIDGET_KEY = "neuralwatt-allowances";

function percentRemaining(
  snapshot: NeuralwattAllowancesUpdatedPayload,
): number | undefined {
  if (snapshot.sessionAllowanceRemainingUsd === null) return;
  const total =
    snapshot.sessionSpentUsd + snapshot.sessionAllowanceRemainingUsd;
  if (total <= 0) return;
  return Math.round((snapshot.sessionAllowanceRemainingUsd / total) * 100);
}

export function renderAllowanceWidget(
  snapshot: NeuralwattAllowancesUpdatedPayload,
  config: AllowanceConfig,
): string[] {
  const lines: string[] = ["Neuralwatt allowance"];
  const pct = percentRemaining(snapshot);

  if (snapshot.sessionAllowanceRemainingUsd === null) {
    lines.push(`Session spent: ${formatUsd(snapshot.sessionSpentUsd)}`);
  } else {
    const suffix = pct === undefined ? "" : ` (${pct}% remaining)`;
    lines.push(
      `Session: ${formatUsd(snapshot.sessionAllowanceRemainingUsd)} remaining${suffix}`,
    );
    lines.push(`Spent: ${formatUsd(snapshot.sessionSpentUsd)}`);
  }

  if (config.request.enabled && config.request.allowanceUsd !== undefined) {
    lines.push(`Request cap: ${formatUsd(config.request.allowanceUsd)}`);
  }

  return lines;
}
