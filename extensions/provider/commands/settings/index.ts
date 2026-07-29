import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import {
  configLoader,
  type NeuralwattConfig,
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

function featureValue(
  section: { enabled?: boolean } | undefined,
  fallback: boolean,
): boolean {
  return section?.enabled ?? fallback;
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
                (tabConfig?.provider?.includeLegacyModelIds ??
                resolved.provider.includeLegacyModelIds)
                  ? "include"
                  : "ignore",
              values: ["include", "ignore"],
            },
            {
              id: "includeAliasedModelIds",
              label: "Alias model IDs",
              description:
                "Include active creator-scoped model IDs as aliases in the model picker",
              currentValue:
                (tabConfig?.provider?.includeAliasedModelIds ??
                resolved.provider.includeAliasedModelIds)
                  ? "include"
                  : "ignore",
              values: ["include", "ignore"],
            },
            {
              id: "includeEarlyAccessModels",
              label: "Early access models",
              description:
                "Include pre-release Neuralwatt models that your API key can reach but that are not yet in the public model list",
              currentValue:
                (tabConfig?.provider?.includeEarlyAccessModels ??
                resolved.provider.includeEarlyAccessModels)
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
        return {
          ...config,
          provider: {
            ...config.provider,
            includeLegacyModelIds: newValue === "include",
          },
        };
      }

      if (id === "includeAliasedModelIds") {
        return {
          ...config,
          provider: {
            ...config.provider,
            includeAliasedModelIds: newValue === "include",
          },
        };
      }

      if (id === "includeEarlyAccessModels") {
        return {
          ...config,
          provider: {
            ...config.provider,
            includeEarlyAccessModels: newValue === "include",
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
            ...config,
            quotaCommand: { ...config.quotaCommand, enabled },
          };
        case "quotaWarnings":
          return {
            ...config,
            quotaWarnings: { ...config.quotaWarnings, enabled },
          };
        case "subBarIntegration":
          return {
            ...config,
            subBarIntegration: { ...config.subBarIntegration, enabled },
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
