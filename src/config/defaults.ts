import type { ResolvedNeuralwattConfig } from "./types";

export const DEFAULT_CONFIG: ResolvedNeuralwattConfig = {
  quotaCommand: true,
  quotaWarnings: true,
  subBarIntegration: true,
  includeLegacyModelIds: false,
  includeHiddenModels: false,
};
