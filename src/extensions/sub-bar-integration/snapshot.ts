import type { NeuralwattQuotas } from "../../types/quota-api";
import {
  percentCreditsRemaining,
  percentEnergyRemaining,
} from "../../utils/quota-bar";
import { formatKwh } from "../../utils/quota-format";

interface RateWindow {
  label: string;
  usedPercent: number;
  resetDescription?: string;
}

export interface UsageSnapshot {
  provider: string;
  displayName: string;
  windows: RateWindow[];
  lastSuccessAt?: number;
}

export function toUsageSnapshot(quotas: NeuralwattQuotas): UsageSnapshot {
  const windows: RateWindow[] = [];

  const creditsRemaining = percentCreditsRemaining(quotas);
  const creditsUsed = 100 - creditsRemaining;
  windows.push({
    label: "Credits",
    usedPercent: Math.max(0, Math.min(100, creditsUsed)),
  });

  if (quotas.subscription) {
    const energyRemaining = percentEnergyRemaining(quotas.subscription);
    const energyUsed = 100 - energyRemaining;
    windows.push({
      label: "Energy",
      usedPercent: Math.max(0, Math.min(100, energyUsed)),
      resetDescription: `${formatKwh(quotas.subscription.kwh_remaining)} left`,
    });
  }

  return {
    provider: "neuralwatt",
    displayName: "Neuralwatt",
    windows,
    lastSuccessAt: Date.now(),
  };
}
