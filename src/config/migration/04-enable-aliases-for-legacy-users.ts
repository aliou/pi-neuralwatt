import type { Migration } from "@aliou/pi-utils-settings";

/** Nested config shape before aliases were split out (pre-0.11.0). */
interface PreAliasNeuralwattConfig {
  $schema?: string;
  provider?: {
    includeLegacyModelIds?: boolean;
    includeAliasedModelIds?: boolean;
    includeEarlyAccessModels?: boolean;
  };
  quotaCommand?: { enabled?: boolean };
  quotaWarnings?: { enabled?: boolean };
  subBarIntegration?: { enabled?: boolean };
}

/**
 * Creator-scoped active model IDs were split out of the legacy model ID setting.
 * Preserve behavior for users who had explicitly enabled legacy model IDs.
 */
export const enableAliasesForLegacyUsersMigration: Migration<PreAliasNeuralwattConfig> =
  {
    name: "enable-alias-model-ids-for-legacy-users",
    version: "0.11.0",
    shouldRun: (config) =>
      config.provider?.includeLegacyModelIds === true &&
      config.provider?.includeAliasedModelIds === undefined,
    message:
      "[neuralwatt] active model aliases now use `provider.includeAliasedModelIds`; it was enabled because legacy model IDs were enabled.",
    run: (config) => {
      const provider = config.provider;
      if (!provider) return config;

      return {
        ...config,
        provider: {
          ...provider,
          includeAliasedModelIds: true,
        },
      };
    },
  };
