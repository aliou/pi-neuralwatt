export interface PreviousNeuralwattConfig {
  /** $schema URL for editor autocomplete. */
  $schema?: string;

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

export interface NeuralwattProviderConfig {
  /** Include legacy Neuralwatt model IDs in the model picker. */
  includeLegacyModelIds?: boolean;

  /** Include hidden Neuralwatt models discovered via the authenticated API. */
  includeHiddenModels?: boolean;
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

export type NeuralwattWidgetPlacement = "aboveEditor" | "belowEditor";

export interface NeuralwattAllowanceLimitConfig {
  /** Send this allowance header on Neuralwatt requests. */
  enabled?: boolean;

  /** Maximum spend in USD for this allowance scope. */
  allowanceUsd?: number;
}

export interface NeuralwattAllowanceWidgetConfig {
  /** Show Neuralwatt allowance state near the editor. */
  enabled?: boolean;

  /** Place the widget above or below the editor. */
  placement?: NeuralwattWidgetPlacement;
}

export interface NeuralwattAllowanceWarningsConfig {
  /** Show warnings when session allowance is low. */
  enabled?: boolean;

  /** Remaining-percent thresholds that trigger one warning per session. */
  remainingThresholds?: number[];
}

export interface NeuralwattAllowancesConfig {
  /** Inject Neuralwatt allowance headers and display allowance state. */
  enabled?: boolean;

  /** Per-session allowance behavior. */
  session?: NeuralwattAllowanceLimitConfig;

  /** Per-request allowance behavior. */
  request?: NeuralwattAllowanceLimitConfig;

  /** Editor-adjacent allowance widget. */
  widget?: NeuralwattAllowanceWidgetConfig;

  /** Session allowance warnings. */
  warnings?: NeuralwattAllowanceWarningsConfig;
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

  /** Hidden Neuralwatt request/session allowance controls. */
  allowances?: NeuralwattAllowancesConfig;
}

export type NeuralwattRawConfig = PreviousNeuralwattConfig | NeuralwattConfig;

export interface ResolvedNeuralwattConfig {
  provider: {
    includeLegacyModelIds: boolean;
    includeHiddenModels: boolean;
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
  allowances: {
    enabled: boolean;
    session: {
      enabled: boolean;
      allowanceUsd?: number;
    };
    request: {
      enabled: boolean;
      allowanceUsd?: number;
    };
    widget: {
      enabled: boolean;
      placement: NeuralwattWidgetPlacement;
    };
    warnings: {
      enabled: boolean;
      remainingThresholds: number[];
    };
  };
}
