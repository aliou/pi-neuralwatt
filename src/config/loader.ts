import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import packageJson from "../../package.json";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type {
  NeuralwattRawConfig,
  NeuralwattWidgetPlacement,
  ResolvedNeuralwattConfig,
} from "./types";

type ConfigRecord = Record<string, unknown>;

type MaybeEnabled = { enabled?: boolean };
type MaybeProvider = {
  includeLegacyModelIds?: boolean;
  includeHiddenModels?: boolean;
};

type MaybeAllowanceLimit = MaybeEnabled & { allowanceUsd?: number };
type MaybeAllowanceWidget = MaybeEnabled & {
  placement?: NeuralwattWidgetPlacement;
};
type MaybeAllowanceWarnings = MaybeEnabled & {
  remainingThresholds?: number[];
};
type MaybeAllowances = MaybeEnabled & {
  session?: MaybeAllowanceLimit;
  request?: MaybeAllowanceLimit;
  widget?: MaybeAllowanceWidget;
  warnings?: MaybeAllowanceWarnings;
};

function featureEnabled(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const { enabled } = value as MaybeEnabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return fallback;
}

function objectValue<T extends object>(value: unknown): Partial<T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<T>)
    : {};
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function thresholds(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const parsed = value.filter(
    (threshold): threshold is number =>
      typeof threshold === "number" && Number.isFinite(threshold),
  );
  return parsed.length > 0 ? parsed : fallback;
}

function widgetPlacement(
  value: unknown,
  fallback: NeuralwattWidgetPlacement,
): NeuralwattWidgetPlacement {
  return value === "aboveEditor" || value === "belowEditor" ? value : fallback;
}

function normalizeResolvedConfig(
  resolved: ResolvedNeuralwattConfig,
): ResolvedNeuralwattConfig {
  const record = resolved as unknown as ConfigRecord;
  const provider = objectValue<MaybeProvider>(record.provider);
  const allowances = objectValue<MaybeAllowances>(record.allowances);
  const sessionAllowance = objectValue<MaybeAllowanceLimit>(allowances.session);
  const requestAllowance = objectValue<MaybeAllowanceLimit>(allowances.request);
  const allowanceWidget = objectValue<MaybeAllowanceWidget>(allowances.widget);
  const allowanceWarnings = objectValue<MaybeAllowanceWarnings>(
    allowances.warnings,
  );

  return {
    provider: {
      includeLegacyModelIds:
        provider.includeLegacyModelIds ??
        (typeof record.includeLegacyModelIds === "boolean"
          ? record.includeLegacyModelIds
          : DEFAULT_CONFIG.provider.includeLegacyModelIds),
      includeHiddenModels:
        provider.includeHiddenModels ??
        (typeof record.includeHiddenModels === "boolean"
          ? record.includeHiddenModels
          : DEFAULT_CONFIG.provider.includeHiddenModels),
    },
    quotaCommand: {
      enabled: featureEnabled(
        record.quotaCommand,
        DEFAULT_CONFIG.quotaCommand.enabled,
      ),
    },
    quotaWarnings: {
      enabled: featureEnabled(
        record.quotaWarnings,
        DEFAULT_CONFIG.quotaWarnings.enabled,
      ),
    },
    subBarIntegration: {
      enabled: featureEnabled(
        record.subBarIntegration,
        DEFAULT_CONFIG.subBarIntegration.enabled,
      ),
    },
    allowances: {
      enabled: featureEnabled(
        record.allowances,
        DEFAULT_CONFIG.allowances.enabled,
      ),
      session: {
        enabled: featureEnabled(
          allowances.session,
          DEFAULT_CONFIG.allowances.session.enabled,
        ),
        allowanceUsd: optionalPositiveNumber(sessionAllowance.allowanceUsd),
      },
      request: {
        enabled: featureEnabled(
          allowances.request,
          DEFAULT_CONFIG.allowances.request.enabled,
        ),
        allowanceUsd: optionalPositiveNumber(requestAllowance.allowanceUsd),
      },
      widget: {
        enabled: featureEnabled(
          allowances.widget,
          DEFAULT_CONFIG.allowances.widget.enabled,
        ),
        placement: widgetPlacement(
          allowanceWidget.placement,
          DEFAULT_CONFIG.allowances.widget.placement,
        ),
      },
      warnings: {
        enabled: featureEnabled(
          allowances.warnings,
          DEFAULT_CONFIG.allowances.warnings.enabled,
        ),
        remainingThresholds: thresholds(
          allowanceWarnings.remainingThresholds,
          DEFAULT_CONFIG.allowances.warnings.remainingThresholds,
        ),
      },
    },
  };
}

export const configLoader = new ConfigLoader<
  NeuralwattRawConfig,
  ResolvedNeuralwattConfig
>("neuralwatt", DEFAULT_CONFIG, {
  migrations,
  schemaUrl: buildSchemaUrl("@aliou/pi-neuralwatt", packageJson.version),
  afterMerge: normalizeResolvedConfig,
});
