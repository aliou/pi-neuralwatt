import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../src/config";
import {
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattConfigUpdatedPayload,
  type NeuralwattQuotasUpdatedPayload,
} from "../../src/events";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import {
  percentCreditsRemaining,
  percentEnergyRemaining,
} from "../../src/utils/quota-bar";
import { formatKwh, formatUsd } from "../../src/utils/quota-format";
import { toUsageSnapshot } from "./snapshot";

function formatStatus(quotas: NeuralwattQuotas, theme: Theme): string {
  const parts: string[] = [];

  const creditsRemaining = percentCreditsRemaining(quotas);
  const creditsColor =
    creditsRemaining > 50
      ? "success"
      : creditsRemaining > 20
        ? "warning"
        : "error";
  parts.push(
    `${theme.fg("dim", "credits:")} ${theme.fg(creditsColor, formatUsd(quotas.balance.credits_remaining_usd))}`,
  );

  if (quotas.subscription) {
    const energyRemaining = percentEnergyRemaining(quotas.subscription);
    const energyColor =
      energyRemaining > 50
        ? "success"
        : energyRemaining > 20
          ? "warning"
          : "error";
    parts.push(
      `${theme.fg("dim", "energy:")} ${theme.fg(energyColor, formatKwh(quotas.subscription.kwh_remaining))}`,
    );
  }

  return parts.join(" ");
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().subBarIntegration.enabled;
  let subCoreReady = false;
  let currentProvider: string | undefined;
  let unsubscribeQuotas: (() => void) | undefined;

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.subBarIntegration
      .enabled;
  });

  function isActive(): boolean {
    return currentProvider === "neuralwatt";
  }

  function emitUsage(quotas: NeuralwattQuotas): void {
    pi.events.emit("sub-core:update-current", {
      state: {
        provider: "neuralwatt",
        usage: toUsageSnapshot(quotas),
      },
    });
  }

  function requestQuotas(): void {
    pi.events.emit(NEURALWATT_QUOTAS_REQUEST_EVENT, undefined);
  }

  // The quota handler runs on the shared event bus, so it must only touch a
  // session ctx captured by a live session-scoped subscription: pi
  // invalidates session-bound ctx after session replacement (newSession/
  // fork/switchSession/reload), and dereferencing a stale ctx throws. We
  // subscribe in session_start (capturing the fresh ctx in the closure) and
  // unsubscribe in session_shutdown, before the ctx can go stale.
  function handleQuotas(ctx: ExtensionContext, data: unknown): void {
    if (!isActive() || !subCoreReady || !enabled) return;
    if (!data || typeof data !== "object") return;
    const { quotas } = data as NeuralwattQuotasUpdatedPayload;
    emitUsage(quotas);

    ctx.ui.setStatus("neuralwatt-usage", formatStatus(quotas, ctx.ui.theme));
  }

  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
  });

  pi.on("session_start", async (_event, ctx) => {
    unsubscribeQuotas?.();
    currentProvider = ctx.model?.provider;
    unsubscribeQuotas = pi.events.on(NEURALWATT_QUOTAS_UPDATED_EVENT, (data) =>
      handleQuotas(ctx, data),
    );
  });

  pi.on("model_select", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;

    if (subCoreReady && isActive() && enabled) {
      requestQuotas();
    }
  });

  pi.on("session_shutdown", () => {
    unsubscribeQuotas?.();
    unsubscribeQuotas = undefined;
    currentProvider = undefined;
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "subBarIntegration",
    });
  });
}
