import type { Migration } from "@aliou/pi-utils-settings";

/** Flat config shape before the 0.8.x nested migration. */
interface FlatNeuralwattConfig {
  $schema?: string;
  quotaCommand?: boolean;
  quotaWarnings?: boolean;
  subBarIntegration?: boolean;
  includeLegacyModelIds?: boolean;
  includeHiddenModels?: boolean;
}

function isPreviousConfigWithoutLegacyDefault(
  config: FlatNeuralwattConfig,
): boolean {
  return config.includeLegacyModelIds === undefined;
}

export const disableLegacyModelIdsByDefaultMigration: Migration<FlatNeuralwattConfig> =
  {
    name: "disable-legacy-model-ids-by-default",
    version: "0.8.0",
    shouldRun: isPreviousConfigWithoutLegacyDefault,
    message:
      "[neuralwatt] legacy model IDs (ids including the provider and the quantization) are disabled by default. You can enable them with /neuralwatt:settings.",
    run: (config) => ({
      ...config,
      includeLegacyModelIds: false,
    }),
  };
