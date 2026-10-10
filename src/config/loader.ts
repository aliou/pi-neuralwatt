import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import packageJson from "../../package.json";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type {
  NeuralwattApi,
  NeuralwattConfig,
  ResolvedNeuralwattConfig,
} from "./types";

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
    provider: {
      api: resolveApi(config.provider?.api),
      apiBaseUrl: resolveApiBaseUrl(config.provider?.apiBaseUrl),
    },
  };
}

export function resolveApi(value: string | undefined): NeuralwattApi {
  if (value === "anthropic-messages" || value === "openai-completions") {
    return value;
  }
  return DEFAULT_CONFIG.provider.api;
}

export function resolveApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/u, "");
  if (!trimmed) {
    return DEFAULT_CONFIG.provider.apiBaseUrl;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_CONFIG.provider.apiBaseUrl;
    }
  } catch {
    return DEFAULT_CONFIG.provider.apiBaseUrl;
  }
  return trimmed;
}

export function configuredApiBaseUrl(): string {
  try {
    return configLoader.getConfig().provider.apiBaseUrl;
  } catch {
    return DEFAULT_CONFIG.provider.apiBaseUrl;
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
