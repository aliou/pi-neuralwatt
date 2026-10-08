import type { ResolvedNeuralwattConfig } from "./types";

export const NEURALWATT_API_BASE_URL = "https://api.neuralwatt.com/v1";

export const DEFAULT_CONFIG: ResolvedNeuralwattConfig = {
  quotaCommand: {
    enabled: true,
  },
  quotaWarnings: {
    enabled: true,
  },
  subBarIntegration: {
    enabled: true,
  },
  provider: {
    api: "openai-completions",
    apiBaseUrl: NEURALWATT_API_BASE_URL,
  },
};
