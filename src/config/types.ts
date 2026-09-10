export interface NeuralwattQuotaCommandConfig {
  /** Show the quota command (/neuralwatt:quota). */
  enabled?: boolean;
}

export interface NeuralwattQuotaWarningsConfig {
  /** Show quota warnings when credits or energy are low. */
  enabled?: boolean;
}

export interface NeuralwattSubBarIntegrationConfig {
  /** Show usage in the sub-bar / status bar. */
  enabled?: boolean;
}

/**
 * Neuralwatt serves every chat model twice: on an OpenAI-compatible
 * `chat/completions` endpoint and on a vLLM-backed Anthropic-compatible
 * `POST /v1/messages` endpoint. Exactly one serves the provider at a time.
 */
export type NeuralwattApi = "openai-completions" | "anthropic-messages";

export interface NeuralwattProviderConfig {
  /** Which API serves model requests. */
  api?: NeuralwattApi;
}

export interface NeuralwattConfig {
  /** $schema URL for editor autocomplete. */
  $schema?: string;

  /** Quota command feature. */
  quotaCommand?: NeuralwattQuotaCommandConfig;

  /** Quota warning feature. */
  quotaWarnings?: NeuralwattQuotaWarningsConfig;

  /** Sub-bar/status-bar integration feature. */
  subBarIntegration?: NeuralwattSubBarIntegrationConfig;

  /** Provider behavior (API surface). */
  provider?: NeuralwattProviderConfig;
}

export interface ResolvedNeuralwattConfig {
  quotaCommand: {
    enabled: boolean;
  };
  quotaWarnings: {
    enabled: boolean;
  };
  subBarIntegration: {
    enabled: boolean;
  };
  provider: {
    api: NeuralwattApi;
  };
}
