export interface NeuralwattConfig {
  /** Show the quota command (/neuralwatt:quota). */
  quotaCommand?: boolean;
  /** Show quota warnings when credits or energy are low. */
  quotaWarnings?: boolean;
  /** Show usage in the sub-bar / status bar. */
  subBarIntegration?: boolean;
  /** Include legacy Neuralwatt model IDs in the model picker. */
  includeLegacyModelIds?: boolean;
  /** Include hidden Neuralwatt models discovered via the authenticated API. */
  includeHiddenModels?: boolean;
}

export interface ResolvedNeuralwattConfig {
  quotaCommand: boolean;
  quotaWarnings: boolean;
  subBarIntegration: boolean;
  includeLegacyModelIds: boolean;
  includeHiddenModels: boolean;
}
