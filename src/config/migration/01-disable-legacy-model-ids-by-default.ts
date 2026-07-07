import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig, PreviousNeuralwattConfig } from "../types";

type MigrationConfig = PreviousNeuralwattConfig | NeuralwattConfig;

type MutableConfigRecord = Record<string, unknown>;

function hasOwn(record: MutableConfigRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

function hasNestedConfig(config: MigrationConfig): boolean {
  return Boolean(
    ("provider" in config && config.provider) ||
      (config.quotaCommand && typeof config.quotaCommand === "object") ||
      (config.quotaWarnings && typeof config.quotaWarnings === "object") ||
      (config.subBarIntegration &&
        typeof config.subBarIntegration === "object"),
  );
}

function isPreviousConfigWithoutLegacyDefault(
  config: MigrationConfig,
): config is PreviousNeuralwattConfig {
  return (
    !hasNestedConfig(config) &&
    !hasOwn(config as MutableConfigRecord, "includeLegacyModelIds")
  );
}

export const disableLegacyModelIdsByDefaultMigration: Migration<MigrationConfig> =
  {
    name: "disable-legacy-model-ids-by-default",
    shouldRun: isPreviousConfigWithoutLegacyDefault,
    message:
      "[neuralwatt] legacy model IDs (ids including the provider and the quantization) are disabled by default. You can enable them with /neuralwatt:settings.",
    run: (config) => {
      const previous = config as PreviousNeuralwattConfig;
      return {
        ...previous,
        includeLegacyModelIds: false,
      };
    },
  };
