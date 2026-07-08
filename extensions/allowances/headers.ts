import type { ResolvedNeuralwattConfig } from "../../src/config";

type AllowanceConfig = ResolvedNeuralwattConfig["allowances"];

type MutableHeaders = Record<string, string | null | undefined>;

function usdHeaderValue(value: number): string {
  return value.toString();
}

export function applyAllowanceHeaders(
  headers: MutableHeaders,
  sessionId: string,
  config: AllowanceConfig,
): void {
  if (!config.enabled) return;

  if (config.session.enabled) {
    headers["X-Session-ID"] = sessionId;
    if (config.session.allowanceUsd !== undefined) {
      headers["X-Session-Allowance-USD"] = usdHeaderValue(
        config.session.allowanceUsd,
      );
    }
  }

  if (config.request.enabled && config.request.allowanceUsd !== undefined) {
    headers["X-Request-Allowance-USD"] = usdHeaderValue(
      config.request.allowanceUsd,
    );
  }
}
