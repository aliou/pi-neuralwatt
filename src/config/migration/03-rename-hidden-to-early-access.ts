import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig } from "../types";

/** The provider section before `includeHiddenModels` was renamed. */
interface PreviousProviderConfig {
  includeLegacyModelIds?: boolean;
  includeEarlyAccessModels?: boolean;
  /** Renamed to `includeEarlyAccessModels`. */
  includeHiddenModels?: boolean;
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
 * `provider.includeHiddenModels` was renamed to `provider.includeEarlyAccessModels`.
 * The models were never hidden, only released to authorized accounts first.
 */
export const renameHiddenToEarlyAccessMigration: Migration<NeuralwattConfig> = {
  name: "rename-hidden-models-to-early-access",
  version: "0.10.6",
  shouldRun: (config) =>
    previousProvider(config)?.includeHiddenModels !== undefined,
  message:
    "[neuralwatt] `provider.includeHiddenModels` is now `provider.includeEarlyAccessModels`.",
  run: (config) => {
    const provider = previousProvider(config);
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
