import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import {
  configLoader,
  type NeuralwattConfig,
  type NeuralwattRawConfig,
  type ResolvedNeuralwattConfig,
} from "../../../../src/config";
import {
  NEURALWATT_CONFIG_UPDATED_EVENT,
  type NeuralwattFeatureId,
} from "../../../../src/events";

export interface RegisterNeuralwattSettingsOptions {
  getLoadedFeatures: () => Set<NeuralwattFeatureId>;
}

function emitConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(NEURALWATT_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
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

function optionalFeatureValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const enabled = (value as { enabled?: boolean }).enabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return undefined;
}

function featureValue(value: unknown, fallback: boolean): boolean {
  return optionalFeatureValue(value) ?? fallback;
}

function toNestedConfig(config: NeuralwattRawConfig): NeuralwattConfig {
  const provider = "provider" in config ? config.provider : undefined;

  return {
    provider: {
      ...(provider ?? {}),
      includeLegacyModelIds:
        provider?.includeLegacyModelIds ??
        ("includeLegacyModelIds" in config
          ? config.includeLegacyModelIds
          : undefined),
      includeHiddenModels:
        provider?.includeHiddenModels ??
        ("includeHiddenModels" in config
          ? config.includeHiddenModels
          : undefined),
    },
    quotaCommand: {
      ...(typeof config.quotaCommand === "object" ? config.quotaCommand : {}),
      enabled: optionalFeatureValue(config.quotaCommand),
    },
    quotaWarnings: {
      ...(typeof config.quotaWarnings === "object" ? config.quotaWarnings : {}),
      enabled: optionalFeatureValue(config.quotaWarnings),
    },
    subBarIntegration: {
      ...(typeof config.subBarIntegration === "object"
        ? config.subBarIntegration
        : {}),
      enabled: optionalFeatureValue(config.subBarIntegration),
    },
  };
}

export function registerNeuralwattSettings(
  pi: ExtensionAPI,
  options: RegisterNeuralwattSettingsOptions,
): void {
  const { getLoadedFeatures } = options;

  registerSettingsCommand<NeuralwattRawConfig, ResolvedNeuralwattConfig>(pi, {
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
              featureValue(
                tabConfig?.quotaCommand,
                resolved.quotaCommand.enabled,
              ),
              loaded.has("quotaCommand"),
            ),
            featureRow(
              "quotaWarnings",
              "Quota warnings",
              "Toggle notifications when credits or energy are running low",
              featureValue(
                tabConfig?.quotaWarnings,
                resolved.quotaWarnings.enabled,
              ),
              loaded.has("quotaWarnings"),
            ),
            featureRow(
              "subBarIntegration",
              "Sub-bar integration",
              "Toggle integration with the status bar and sub-core",
              featureValue(
                tabConfig?.subBarIntegration,
                resolved.subBarIntegration.enabled,
              ),
              loaded.has("subBarIntegration"),
            ),
          ],
        },
        {
          label: "Other settings",
          items: [
            {
              id: "includeLegacyModelIds",
              label: "Legacy model IDs",
              description:
                "Include deprecated Neuralwatt model IDs as aliases in the model picker",
              currentValue:
                ((tabConfig &&
                  "provider" in tabConfig &&
                  tabConfig.provider?.includeLegacyModelIds) ??
                (tabConfig &&
                  "includeLegacyModelIds" in tabConfig &&
                  tabConfig.includeLegacyModelIds) ??
                resolved.provider.includeLegacyModelIds)
                  ? "include"
                  : "ignore",
              values: ["include", "ignore"],
            },
            {
              id: "includeHiddenModels",
              label: "Hidden models",
              description:
                "Include Neuralwatt models that are accessible via API key but not advertised in the public model list",
              currentValue:
                ((tabConfig &&
                  "provider" in tabConfig &&
                  tabConfig.provider?.includeHiddenModels) ??
                (tabConfig &&
                  "includeHiddenModels" in tabConfig &&
                  tabConfig.includeHiddenModels) ??
                resolved.provider.includeHiddenModels)
                  ? "include"
                  : "ignore",
              values: ["include", "ignore"],
            },
          ],
        },
      ];
    },
    onSettingChange: (id, newValue, config) => {
      // Non-feature toggles are handled first so they are not blocked by the
      // loaded-features guard (they are managed directly by the provider).
      if (id === "includeLegacyModelIds") {
        const nestedConfig = toNestedConfig(config);
        return {
          ...nestedConfig,
          provider: {
            ...nestedConfig.provider,
            includeLegacyModelIds: newValue === "include",
          },
        };
      }

      if (id === "includeHiddenModels") {
        const nestedConfig = toNestedConfig(config);
        return {
          ...nestedConfig,
          provider: {
            ...nestedConfig.provider,
            includeHiddenModels: newValue === "include",
          },
        };
      }

      if (!getLoadedFeatures().has(id as NeuralwattFeatureId)) {
        return null;
      }

      const enabled = newValue === "enabled";
      switch (id) {
        case "quotaCommand":
          return {
            ...toNestedConfig(config),
            quotaCommand: { ...toNestedConfig(config).quotaCommand, enabled },
          };
        case "quotaWarnings":
          return {
            ...toNestedConfig(config),
            quotaWarnings: { ...toNestedConfig(config).quotaWarnings, enabled },
          };
        case "subBarIntegration":
          return {
            ...toNestedConfig(config),
            subBarIntegration: {
              ...toNestedConfig(config).subBarIntegration,
              enabled,
            },
          };
        default:
          return null;
      }
    },
    onSave: async () => {
      emitConfigUpdated(pi);
    },
  });
}
