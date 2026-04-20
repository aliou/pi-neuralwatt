import {
  ConfigLoader,
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SettingItem } from "@mariozechner/pi-tui";

export type NeuralwattFeatureId =
  | "quotaCommand"
  | "quotaWarnings"
  | "subBarIntegration";

export const NEURALWATT_EXTENSIONS_REQUEST_EVENT =
  "neuralwatt:extensions:request" as const;

export const NEURALWATT_EXTENSIONS_REGISTER_EVENT =
  "neuralwatt:extensions:register" as const;

export interface NeuralwattExtensionsRegisterPayload {
  feature: NeuralwattFeatureId;
}

export interface NeuralwattConfig {
  /** Show the quota command (/neuralwatt:quota). */
  quotaCommand?: boolean;
  /** Show quota warnings when credits or energy are low. */
  quotaWarnings?: boolean;
  /** Show usage in the sub-bar / status bar. */
  subBarIntegration?: boolean;
}

export interface ResolvedNeuralwattConfig {
  quotaCommand: boolean;
  quotaWarnings: boolean;
  subBarIntegration: boolean;
}

const DEFAULTS: ResolvedNeuralwattConfig = {
  quotaCommand: true,
  quotaWarnings: true,
  subBarIntegration: true,
};

export const configLoader = new ConfigLoader<
  NeuralwattConfig,
  ResolvedNeuralwattConfig
>("neuralwatt", DEFAULTS);

export const NEURALWATT_CONFIG_UPDATED_EVENT =
  "neuralwatt:config:updated" as const;

export interface NeuralwattConfigUpdatedPayload {
  config: ResolvedNeuralwattConfig;
}

export function emitConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(NEURALWATT_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}

export interface RegisterNeuralwattSettingsOptions {
  getLoadedFeatures: () => Set<NeuralwattFeatureId>;
}

function featureRow(
  id: NeuralwattFeatureId,
  label: string,
  description: string,
  configValue: boolean,
  isLoaded: boolean,
): SettingItem {
  if (isLoaded) {
    return {
      id,
      label,
      description,
      currentValue: configValue ? "enabled" : "disabled",
      values: ["enabled", "disabled"],
    };
  }
  return {
    id,
    label,
    description: `${description} (Not loaded by Pi)`,
    currentValue: "unavailable",
    values: [],
  };
}

export function registerNeuralwattSettings(
  pi: ExtensionAPI,
  options: RegisterNeuralwattSettingsOptions,
): void {
  const { getLoadedFeatures } = options;

  registerSettingsCommand<NeuralwattConfig, ResolvedNeuralwattConfig>(pi, {
    commandName: "neuralwatt:settings",
    title: "Neuralwatt Settings",
    configStore: configLoader,
    buildSections: (tabConfig, resolved): SettingsSection[] => {
      const loaded = getLoadedFeatures();
      return [
        {
          label: "Features",
          items: [
            featureRow(
              "quotaCommand",
              "Quota command",
              "Toggle the /neuralwatt:quota command, showing your API usage at a glance",
              tabConfig?.quotaCommand ?? resolved.quotaCommand,
              loaded.has("quotaCommand"),
            ),
            featureRow(
              "quotaWarnings",
              "Quota warnings",
              "Toggle notifications when credits or energy are running low",
              tabConfig?.quotaWarnings ?? resolved.quotaWarnings,
              loaded.has("quotaWarnings"),
            ),
            featureRow(
              "subBarIntegration",
              "Sub-bar integration",
              "Toggle integration with the status bar and sub-core",
              tabConfig?.subBarIntegration ?? resolved.subBarIntegration,
              loaded.has("subBarIntegration"),
            ),
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config) => {
      if (!getLoadedFeatures().has(id as NeuralwattFeatureId)) {
        return null;
      }

      const enabled = newValue === "enabled";
      switch (id) {
        case "quotaCommand":
          return { ...config, quotaCommand: enabled };
        case "quotaWarnings":
          return { ...config, quotaWarnings: enabled };
        case "subBarIntegration":
          return { ...config, subBarIntegration: enabled };
        default:
          return null;
      }
    },
    onSave: async () => {
      emitConfigUpdated(pi);
    },
  });
}
