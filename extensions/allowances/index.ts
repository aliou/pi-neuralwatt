import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../src/config";
import {
  NEURALWATT_ALLOWANCES_UPDATED_EVENT,
  NEURALWATT_CONFIG_UPDATED_EVENT,
  type NeuralwattAllowancesUpdatedPayload,
  type NeuralwattConfigUpdatedPayload,
} from "../../src/events";
import { registerAllowancesCommand } from "./command";
import { applyAllowanceHeaders } from "./headers";
import { checkAllowanceWarnings, clearAllowanceWarningState } from "./warnings";
import { ALLOWANCE_WIDGET_KEY, renderAllowanceWidget } from "./widget";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let config = configLoader.getConfig();
  let currentProvider: string | undefined;
  let currentContext: ExtensionContext | undefined;
  let latestSnapshot: NeuralwattAllowancesUpdatedPayload | undefined;

  registerAllowancesCommand(pi);

  function isActive(): boolean {
    return config.allowances.enabled && currentProvider === "neuralwatt";
  }

  function clearWidget(ctx = currentContext): void {
    if (!ctx?.hasUI) return;
    ctx.ui.setWidget(ALLOWANCE_WIDGET_KEY, undefined);
  }

  function updateWidget(): void {
    if (!currentContext?.hasUI) return;
    if (!isActive() || !config.allowances.widget.enabled || !latestSnapshot) {
      clearWidget();
      return;
    }

    currentContext.ui.setWidget(
      ALLOWANCE_WIDGET_KEY,
      renderAllowanceWidget(latestSnapshot, config.allowances),
      { placement: config.allowances.widget.placement },
    );
  }

  pi.on("before_provider_headers", (event, ctx) => {
    if (ctx.model?.provider !== "neuralwatt") return;
    applyAllowanceHeaders(
      event.headers,
      ctx.sessionManager.getSessionId(),
      config.allowances,
    );
  });

  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    config = (data as NeuralwattConfigUpdatedPayload).config;
    if (!config.allowances.enabled || !config.allowances.warnings.enabled) {
      clearAllowanceWarningState();
    }
    updateWidget();
  });

  pi.events.on(NEURALWATT_ALLOWANCES_UPDATED_EVENT, (data: unknown) => {
    if (!data || typeof data !== "object") return;
    latestSnapshot = data as NeuralwattAllowancesUpdatedPayload;
    if (!isActive()) return;

    updateWidget();
    if (currentContext) {
      checkAllowanceWarnings(
        currentContext,
        latestSnapshot,
        config.allowances.warnings,
      );
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentContext = ctx;
    latestSnapshot = undefined;
    clearAllowanceWarningState();
    updateWidget();
  });

  pi.on("model_select", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentContext = ctx;
    if (!isActive()) clearAllowanceWarningState();
    updateWidget();
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentContext = ctx;
  });

  pi.on("session_shutdown", () => {
    clearWidget();
    currentProvider = undefined;
    currentContext = undefined;
    latestSnapshot = undefined;
    clearAllowanceWarningState();
  });
}
