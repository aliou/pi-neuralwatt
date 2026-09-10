import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import {
  configLoader,
  type NeuralwattApi,
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
  // The provider stamps `provider.api` at extension load; a saved change only
  // reaches it after `/reload`.
  let pendingApi: NeuralwattApi | undefined;

  registerSettingsCommand<NeuralwattConfig, ResolvedNeuralwattConfig>(pi, {
    commandName: "neuralwatt:settings",
    title: "Neuralwatt Settings",
    configStore: configLoader,
    buildSections: (tabConfig, resolved): SettingsSection[] => {
      const loaded = getLoadedFeatures();
      return [
        {
          label: "Provider",
          items: [
            {
              id: "api",
              label: "API",
              description:
                "Serve models via the OpenAI-compatible chat/completions endpoint or the Anthropic-compatible /v1/messages endpoint",
              currentValue: tabConfig?.provider?.api ?? resolved.provider.api,
              values: ["openai-completions", "anthropic-messages"],
            },
          ],
        },
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
      ];
    },
    onSettingChange: (id, newValue, config) => {
      if (id === "api") {
        if (
          newValue !== "openai-completions" &&
          newValue !== "anthropic-messages"
        ) {
          return null;
        }
        pendingApi = newValue;
        return {
          ...config,
          provider: { ...config.provider, api: newValue },
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
    onSave: async (ctx) => {
      emitConfigUpdated(pi);
      if (pendingApi === undefined) return;
      pendingApi = undefined;
      ctx.ui.notify("Run /reload to apply the new API", "info");
    },
  });
}
