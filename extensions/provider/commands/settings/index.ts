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
        {
          label: "Other settings",
          items: [
            {
              id: "includeLegacyModelIds",
              label: "Legacy model IDs",
              description:
                "Include deprecated Neuralwatt model IDs as aliases in the model picker",
              currentValue:
                (tabConfig?.includeLegacyModelIds ??
                resolved.includeLegacyModelIds)
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
                (tabConfig?.includeHiddenModels ?? resolved.includeHiddenModels)
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
        return { ...config, includeLegacyModelIds: newValue === "include" };
      }

      if (id === "includeHiddenModels") {
        return { ...config, includeHiddenModels: newValue === "include" };
      }

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
