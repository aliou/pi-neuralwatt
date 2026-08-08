export type DurationUnit = "ms" | "s" | "m" | "h";

export function parseDuration(
  input: string,
  defaultUnit: DurationUnit = "ms",
): number | undefined {
  const match = input
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h|hr)?$/i);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = (match[2] ? normalizeUnit(match[2]) : defaultUnit).toLowerCase();
  if (unit === "s") return Math.round(value * 1000);
  if (unit === "m") return Math.round(value * 60 * 1000);
  if (unit === "h") return Math.round(value * 60 * 60 * 1000);
  return Math.round(value);
}

function normalizeUnit(unit: string): DurationUnit {
  const lower = unit.toLowerCase();
  if (lower === "sec") return "s";
  if (lower === "min") return "m";
  if (lower === "hr") return "h";
  return lower as DurationUnit;
}

export function formatDuration(ms: number): string {
  if (ms < 60 * 1000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60 / 1000)}m`;
  const hours = Math.floor(ms / 60 / 60 / 1000);
  const minutes = Math.round((ms % (60 * 60 * 1000)) / 60 / 1000);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
