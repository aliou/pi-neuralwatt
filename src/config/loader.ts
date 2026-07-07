import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import packageJson from "../../package.json";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type { NeuralwattRawConfig, ResolvedNeuralwattConfig } from "./types";

type ConfigRecord = Record<string, unknown>;

type MaybeEnabled = { enabled?: boolean };
type MaybeProvider = {
  includeLegacyModelIds?: boolean;
  includeHiddenModels?: boolean;
};

function featureEnabled(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const { enabled } = value as MaybeEnabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return fallback;
}

function normalizeResolvedConfig(
  resolved: ResolvedNeuralwattConfig,
): ResolvedNeuralwattConfig {
  const record = resolved as unknown as ConfigRecord;
  const provider =
    record.provider && typeof record.provider === "object"
      ? (record.provider as MaybeProvider)
      : {};

  return {
    provider: {
      includeLegacyModelIds:
        provider.includeLegacyModelIds ??
        (typeof record.includeLegacyModelIds === "boolean"
          ? record.includeLegacyModelIds
          : DEFAULT_CONFIG.provider.includeLegacyModelIds),
      includeHiddenModels:
        provider.includeHiddenModels ??
        (typeof record.includeHiddenModels === "boolean"
          ? record.includeHiddenModels
          : DEFAULT_CONFIG.provider.includeHiddenModels),
    },
    quotaCommand: {
      enabled: featureEnabled(
        record.quotaCommand,
        DEFAULT_CONFIG.quotaCommand.enabled,
      ),
    },
    quotaWarnings: {
      enabled: featureEnabled(
        record.quotaWarnings,
        DEFAULT_CONFIG.quotaWarnings.enabled,
      ),
    },
    subBarIntegration: {
      enabled: featureEnabled(
        record.subBarIntegration,
        DEFAULT_CONFIG.subBarIntegration.enabled,
      ),
    },
  };
}

export const configLoader = new ConfigLoader<
  NeuralwattRawConfig,
  ResolvedNeuralwattConfig
>("neuralwatt", DEFAULT_CONFIG, {
  migrations,
  schemaUrl: buildSchemaUrl("@aliou/pi-neuralwatt", packageJson.version),
  afterMerge: normalizeResolvedConfig,
});
