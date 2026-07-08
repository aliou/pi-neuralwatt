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
  allowances: {
    enabled: false,
    session: {
      enabled: true,
    },
    request: {
      enabled: false,
    },
    widget: {
      enabled: false,
      placement: "belowEditor",
    },
    warnings: {
      enabled: false,
      remainingThresholds: [50, 20, 10],
    },
  },
};
