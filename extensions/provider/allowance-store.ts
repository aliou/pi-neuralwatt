import type { ResolvedNeuralwattConfig } from "../../src/config";
import {
  type NeuralwattAllowancesUpdatedPayload,
  parseAllowanceHeaders,
} from "../../src/events";

type AllowanceConfig = ResolvedNeuralwattConfig["allowances"];

export function buildAllowancesFromHeaders(
  headers: Record<string, string>,
  sessionId: string,
  config: AllowanceConfig,
): NeuralwattAllowancesUpdatedPayload | undefined {
  const headerAllowances = parseAllowanceHeaders(headers);
  if (!headerAllowances) return;

  return {
    sessionId,
    sessionAllowanceUsd:
      config.enabled &&
      config.session.enabled &&
      config.session.allowanceUsd !== undefined
        ? config.session.allowanceUsd
        : null,
    requestAllowanceUsd:
      config.enabled &&
      config.request.enabled &&
      config.request.allowanceUsd !== undefined
        ? config.request.allowanceUsd
        : null,
    ...headerAllowances,
    updatedAt: new Date().toISOString(),
  };
}
