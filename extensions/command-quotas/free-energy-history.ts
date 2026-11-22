import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { NeuralwattQuotas } from "../../src/types/quota-api";

const MAX_DAYS_NO_SUBSCRIPTION = 40;

interface FreeEnergyHistory {
  days: Record<string, number>;
}

interface PeriodRange {
  start: string;
  end: string;
  inclusiveEnd: boolean;
}

function historyPath(): string {
  return join(getAgentDir(), "neuralwatt-free-energy-history.json");
}

function readHistory(): FreeEnergyHistory {
  try {
    return JSON.parse(readFileSync(historyPath(), "utf8")) as FreeEnergyHistory;
  } catch {
    return { days: {} };
  }
}

function currentPeriodRange(quotas: NeuralwattQuotas): PeriodRange | undefined {
  const sub = quotas.subscription;
  if (
    !sub ||
    sub.current_period_start === null ||
    sub.current_period_end === null
  ) {
    return;
  }
  const start = sub.current_period_start.slice(0, 10);
  const end = sub.current_period_end.slice(0, 10);
  const inclusiveEnd =
    Date.parse(sub.current_period_end) > Date.parse(`${end}T00:00:00Z`);
  return { start, end, inclusiveEnd };
}

function inRange(day: string, range: PeriodRange): boolean {
  if (day < range.start) return false;
  return range.inclusiveEnd ? day <= range.end : day < range.end;
}

function writeHistory(history: FreeEnergyHistory): void {
  writeFileSync(historyPath(), JSON.stringify(history));
}

/** Record the latest daily free-energy usage for today, pruning out-of-period days. */
export function recordFreeEnergyDay(quotas: NeuralwattQuotas): void {
  const block = quotas.daily_free_energy;
  if (!block) return;

  const day = new Date().toISOString().slice(0, 10);
  const history = readHistory();
  history.days[day] = block.kwh_used;

  const range = currentPeriodRange(quotas);
  if (range) {
    history.days = Object.fromEntries(
      Object.entries(history.days).filter(([d]) => inRange(d, range)),
    );
  } else {
    const cutoff = new Date(Date.now() - MAX_DAYS_NO_SUBSCRIPTION * 86_400_000)
      .toISOString()
      .slice(0, 10);
    history.days = Object.fromEntries(
      Object.entries(history.days).filter(([d]) => d >= cutoff),
    );
  }

  writeHistory(history);
}

/** Sum the recorded daily free-energy usage across the current billing period. */
export function freeEnergyPeriodKwh(quotas: NeuralwattQuotas): number {
  const range = currentPeriodRange(quotas);
  if (!range) return 0;
  const { days } = readHistory();
  return Object.entries(days)
    .filter(([d]) => inRange(d, range))
    .reduce((sum, [, used]) => sum + used, 0);
}
