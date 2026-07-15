import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../src/config";
import {
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattConfigUpdatedPayload,
  type NeuralwattQuotasUpdatedPayload,
} from "../../src/events";
import { checkQuotas, clearAlertState } from "./notifier";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().quotaWarnings.enabled;
  let currentContext: ExtensionContext | undefined;

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.quotaWarnings
      .enabled;

    if (!enabled) {
      clearAlertState();
    }
  });

  pi.events.on(NEURALWATT_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!enabled) return;
    if (!data || typeof data !== "object") return;
    if (!currentContext) return;
    if (currentContext.model?.provider !== "neuralwatt") return;

    const { quotas } = data as NeuralwattQuotasUpdatedPayload;
    checkQuotas(currentContext, quotas);
  });

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    if (ctx.model?.provider !== "neuralwatt") return;
    clearAlertState();
  });

  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentContext = ctx;
  });

  pi.on("session_shutdown", () => {
    currentContext = undefined;
    clearAlertState();
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
