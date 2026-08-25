import type { Migration } from "@aliou/pi-utils-settings";

/** Nested config shape with `includeHiddenModels` (pre-0.10.6). */
interface PreRenameNeuralwattConfig {
  $schema?: string;
  provider?: {
    includeLegacyModelIds?: boolean;
    includeEarlyAccessModels?: boolean;
    /** Renamed to `includeEarlyAccessModels`. */
    includeHiddenModels?: boolean;
  };
  quotaCommand?: { enabled?: boolean };
  quotaWarnings?: { enabled?: boolean };
  subBarIntegration?: { enabled?: boolean };
}

/**
 * `provider.includeHiddenModels` was renamed to `provider.includeEarlyAccessModels`.
 * The models were never hidden, only released to authorized accounts first.
 */
export const renameHiddenToEarlyAccessMigration: Migration<PreRenameNeuralwattConfig> =
  {
    name: "rename-hidden-models-to-early-access",
    version: "0.10.6",
    shouldRun: (config) => config.provider?.includeHiddenModels !== undefined,
    message:
      "[neuralwatt] `provider.includeHiddenModels` is now `provider.includeEarlyAccessModels`.",
    run: (config) => {
      const provider = config.provider;
      if (!provider) return config;

      const { includeHiddenModels, ...rest } = provider;

      return {
        ...config,
        provider: {
          ...rest,
          includeEarlyAccessModels:
            rest.includeEarlyAccessModels ?? includeHiddenModels,
        },
      };
    },
  };
