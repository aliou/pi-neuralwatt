import type { Migration } from "@aliou/pi-utils-settings";

export const SUB_BAR_GIST_URL =
  "https://gist.github.com/aliou/9939544f3c5a4f917b0a8e5c0497cdb2";

interface PreRemovalNeuralwattConfig {
  $schema?: string;
  quotaCommand?: { enabled?: boolean };
  quotaWarnings?: { enabled?: boolean };
  subBarIntegration?: { enabled?: boolean };
  provider?: {
    api?: string;
    apiBaseUrl?: string;
    includeLegacyModelIds?: boolean;
    includeEarlyAccessModels?: boolean;
  };
}

export const removeSubBarIntegrationMigration: Migration<PreRemovalNeuralwattConfig> =
  {
    name: "remove-sub-bar-integration",
    version: "0.18.0",
    shouldRun: (config) => config.subBarIntegration !== undefined,
    message: `[neuralwatt] The built-in sub-bar integration was removed. Test with \`pi -e ${SUB_BAR_GIST_URL}\` and install with \`pi install ${SUB_BAR_GIST_URL}\`. The standalone extension won't be kept up to date.`,
    run: (config) => {
      if (config.subBarIntegration === undefined) return config;

      const { subBarIntegration: _removed, ...rest } = config;
      return rest;
    },
  };
