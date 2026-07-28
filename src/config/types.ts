export interface NeuralwattProviderConfig {
  /** Include legacy Neuralwatt model IDs in the model picker. */
  includeLegacyModelIds?: boolean;

  /** Include early-access Neuralwatt models discovered via the authenticated API. */
  includeEarlyAccessModels?: boolean;
}

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

  /** Provider/model behavior. */
  provider?: NeuralwattProviderConfig;

  /** Quota command feature. */
  quotaCommand?: NeuralwattQuotaCommandConfig;

  /** Quota warning feature. */
  quotaWarnings?: NeuralwattQuotaWarningsConfig;

  /** Sub-bar/status-bar integration feature. */
  subBarIntegration?: NeuralwattSubBarIntegrationConfig;
}

export interface ResolvedNeuralwattConfig {
  provider: {
    includeLegacyModelIds: boolean;
    includeEarlyAccessModels: boolean;
  };
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
