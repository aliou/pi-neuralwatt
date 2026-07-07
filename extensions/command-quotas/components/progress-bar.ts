import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Severity } from "../../../src/utils/quota-bar";

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
