import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig } from "../types";

/** The provider section before alias IDs got a separate setting. */
interface PreviousProviderConfig {
  includeLegacyModelIds?: boolean;
  includeAliasedModelIds?: boolean;
  includeEarlyAccessModels?: boolean;
}

function previousProvider(
  config: NeuralwattConfig,
): PreviousProviderConfig | undefined {
  if (!("provider" in config)) return undefined;
  const { provider } = config;
  return provider && typeof provider === "object"
    ? (provider as PreviousProviderConfig)
    : undefined;
}

/**
 * Creator-scoped active model IDs were split out of the legacy model ID setting.
 * Preserve behavior for users who had explicitly enabled legacy model IDs.
 */
export const enableAliasesForLegacyUsersMigration: Migration<NeuralwattConfig> =
  {
    name: "enable-alias-model-ids-for-legacy-users",
    shouldRun: (config) => {
      const provider = previousProvider(config);
      return (
        provider?.includeLegacyModelIds === true &&
        provider.includeAliasedModelIds === undefined
      );
    },
    message:
      "[neuralwatt] active model aliases now use `provider.includeAliasedModelIds`; it was enabled because legacy model IDs were enabled.",
    run: (config) => {
      const provider = previousProvider(config);
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
