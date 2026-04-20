import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  type NeuralwattConfigUpdatedPayload,
} from "../../config";
import {
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattQuotasUpdatedPayload,
} from "../../types/quota-events";
import { checkQuotas, clearAlertState } from "./notifier";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().quotaWarnings;
  let currentProvider: string | undefined;
  let currentContext: ExtensionContext | undefined;

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.quotaWarnings;

    if (!enabled) {
      clearAlertState();
    }
  });

  pi.events.on(NEURALWATT_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!enabled) return;
    if (!data || typeof data !== "object") return;
    if (currentProvider !== "neuralwatt" || !currentContext) return;
    const { quotas, source } = data as NeuralwattQuotasUpdatedPayload;
    checkQuotas(currentContext, quotas, source === "header");
  });

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (ctx.model?.provider !== "neuralwatt") return;
    clearAlertState();
  });

  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
    if (ctx.model?.provider !== "neuralwatt") {
      clearAlertState();
      return;
    }
    clearAlertState();
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentContext = ctx;
    currentProvider = ctx.model?.provider;
  });

  pi.on("session_shutdown", () => {
    currentContext = undefined;
    currentProvider = undefined;
    clearAlertState();
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
