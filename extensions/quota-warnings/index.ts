import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.quotaWarnings
      .enabled;

    if (!enabled) {
      clearAlertState();
    }
  });

  // Subscription to quota updates is scoped to the session that owns `ctx`,
  // so a captured ctx can never be dereferenced after session replacement.
  let unsubscribeQuotas: (() => void) | undefined;

  pi.on("session_start", async (_event, ctx) => {
    // The previous session's listener (if any) is superseded first.
    unsubscribeQuotas?.();
    unsubscribeQuotas = pi.events.on(
      NEURALWATT_QUOTAS_UPDATED_EVENT,
      (data: unknown) => {
        if (!enabled) return;
        if (!data || typeof data !== "object") return;
        // ctx is the active session's context; `.model` is a dynamic getter.
        if (ctx.model?.provider !== "neuralwatt") return;

        const { quotas } = data as NeuralwattQuotasUpdatedPayload;
        checkQuotas(ctx, quotas);
      },
    );

    if (ctx.model?.provider !== "neuralwatt") return;
    clearAlertState();
  });

  pi.on("session_shutdown", () => {
    unsubscribeQuotas?.();
    unsubscribeQuotas = undefined;
    clearAlertState();
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
