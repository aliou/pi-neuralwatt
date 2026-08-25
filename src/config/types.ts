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

export interface NeuralwattConfig {
  /** $schema URL for editor autocomplete. */
  $schema?: string;

  /** Quota command feature. */
  quotaCommand?: NeuralwattQuotaCommandConfig;

  /** Quota warning feature. */
  quotaWarnings?: NeuralwattQuotaWarningsConfig;

  /** Sub-bar/status-bar integration feature. */
  subBarIntegration?: NeuralwattSubBarIntegrationConfig;
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
}
