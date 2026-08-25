import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import packageJson from "../../package.json";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type { NeuralwattConfig, ResolvedNeuralwattConfig } from "./types";

/**
 * Fill in every field the rest of the code reads. Migrations already normalized
 * the on-disk shape, so this only merges partial sections with the defaults.
 */
function normalizeResolvedConfig(
  resolved: ResolvedNeuralwattConfig,
): ResolvedNeuralwattConfig {
  const config = resolved as Partial<ResolvedNeuralwattConfig>;

  return {
    quotaCommand: {
      enabled:
        config.quotaCommand?.enabled ?? DEFAULT_CONFIG.quotaCommand.enabled,
    },
    quotaWarnings: {
      enabled:
        config.quotaWarnings?.enabled ?? DEFAULT_CONFIG.quotaWarnings.enabled,
    },
    subBarIntegration: {
      enabled:
        config.subBarIntegration?.enabled ??
        DEFAULT_CONFIG.subBarIntegration.enabled,
    },
  };
}

export const configLoader = new ConfigLoader<
  NeuralwattConfig,
  ResolvedNeuralwattConfig
>("neuralwatt", DEFAULT_CONFIG, {
  migrations,
  schemaUrl: buildSchemaUrl("@aliou/pi-neuralwatt", packageJson.version),
  afterMerge: normalizeResolvedConfig,
});
