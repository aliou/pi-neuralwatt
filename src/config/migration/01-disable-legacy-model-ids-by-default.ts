import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig } from "../types";

type MutableConfigRecord = Record<string, unknown>;

function hasOwn(record: MutableConfigRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

function hasNestedConfig(config: NeuralwattConfig): boolean {
  return Boolean(
    ("provider" in config && config.provider) ||
      (config.quotaCommand && typeof config.quotaCommand === "object") ||
      (config.quotaWarnings && typeof config.quotaWarnings === "object") ||
      (config.subBarIntegration &&
        typeof config.subBarIntegration === "object"),
  );
}

function isPreviousConfigWithoutLegacyDefault(
  config: NeuralwattConfig,
): boolean {
  return (
    !hasNestedConfig(config) &&
    !hasOwn(config as MutableConfigRecord, "includeLegacyModelIds")
  );
}

export const disableLegacyModelIdsByDefaultMigration: Migration<NeuralwattConfig> =
  {
    name: "disable-legacy-model-ids-by-default",
    version: "0.8.0",
    shouldRun: isPreviousConfigWithoutLegacyDefault,
    message:
      "[neuralwatt] legacy model IDs (ids including the provider and the quantization) are disabled by default. You can enable them with /neuralwatt:settings.",
    // Flat config: `includeLegacyModelIds` sits at the top level here. Migration
    // 02 moves it under `provider`.
    run: (config) =>
      ({
        ...config,
        includeLegacyModelIds: false,
      }) as unknown as NeuralwattConfig,
  };
