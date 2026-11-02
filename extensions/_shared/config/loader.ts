import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import packageJson from "../../../package.json";
import { DEFAULT_CONFIG } from "../../../src/config/defaults";
import { resolveApi, resolveApiBaseUrl } from "../../../src/config/resolve";
import type {
  NeuralwattConfig,
  ResolvedNeuralwattConfig,
} from "../../../src/config/types";
import { migrations } from "./migration";

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
    hostedTools: config.hostedTools,
    provider: {
      api: resolveApi(config.provider?.api),
      apiBaseUrl: resolveApiBaseUrl(config.provider?.apiBaseUrl),
    },
  };
}

export function configuredApiBaseUrl(): string {
  try {
    return configLoader.getConfig().provider.apiBaseUrl;
  } catch {
    return DEFAULT_CONFIG.provider.apiBaseUrl;
  }
}

export function hostedToolsOptOut(): boolean {
  try {
    return configLoader.getConfig().hostedTools?.enabled === false;
  } catch {
    return false;
  }
}

export const configLoader = new ConfigLoader<
  NeuralwattConfig,
  ResolvedNeuralwattConfig
>("neuralwatt", DEFAULT_CONFIG, {
  migrations,
  schemaUrl: buildSchemaUrl("@aliou/pi-neuralwatt", packageJson.version),
  afterMerge: normalizeResolvedConfig,
});
