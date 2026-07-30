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
  let currentProvider: string | undefined;
  let unsubscribeQuotas: (() => void) | undefined;

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.quotaWarnings
      .enabled;

    if (!enabled) {
      clearAlertState();
    }
  });

  // The quota handler runs on the shared event bus, so it must only touch a
  // session ctx captured by a live session-scoped subscription: pi
  // invalidates session-bound ctx after session replacement (newSession/
  // fork/switchSession/reload), and dereferencing a stale ctx throws. We
  // subscribe in session_start (capturing the fresh ctx in the closure) and
  // unsubscribe in session_shutdown, before the ctx can go stale.
  function handleQuotas(ctx: ExtensionContext, data: unknown): void {
    if (!enabled) return;
    if (!data || typeof data !== "object") return;
    if (currentProvider !== "neuralwatt") return;

    const { quotas } = data as NeuralwattQuotasUpdatedPayload;
    checkQuotas(ctx, quotas);
  }

  pi.on("session_start", async (_event, ctx) => {
    unsubscribeQuotas?.();
    currentProvider = ctx.model?.provider;
    unsubscribeQuotas = pi.events.on(NEURALWATT_QUOTAS_UPDATED_EVENT, (data) =>
      handleQuotas(ctx, data),
    );

    if (currentProvider !== "neuralwatt") return;
    clearAlertState();
  });

  pi.on("model_select", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
  });

  pi.on("session_shutdown", () => {
    unsubscribeQuotas?.();
    unsubscribeQuotas = undefined;
    currentProvider = undefined;
    clearAlertState();
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
