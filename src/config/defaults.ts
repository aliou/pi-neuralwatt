import type { ResolvedNeuralwattConfig } from "./types";

export const DEFAULT_CONFIG: ResolvedNeuralwattConfig = {
  provider: {
    includeLegacyModelIds: false,
    includeHiddenModels: false,
  },
  quotaCommand: {
    enabled: true,
  },
  quotaWarnings: {
    enabled: true,
  },
  subBarIntegration: {
    enabled: true,
  },
};
