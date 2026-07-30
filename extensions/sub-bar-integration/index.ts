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

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.subBarIntegration
      .enabled;
  });

  function isActive(ctx: ExtensionContext): boolean {
    return ctx.model?.provider === "neuralwatt";
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

  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
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
        if (!isActive(ctx) || !subCoreReady || !enabled) return;
        if (!data || typeof data !== "object") return;
        const { quotas } = data as NeuralwattQuotasUpdatedPayload;
        emitUsage(quotas);
        ctx.ui.setStatus(
          "neuralwatt-usage",
          formatStatus(quotas, ctx.ui.theme),
        );
      },
    );

    if (subCoreReady && isActive(ctx) && enabled) {
      requestQuotas();
    }
  });

  pi.on("model_select", async (_event, ctx) => {
    if (subCoreReady && isActive(ctx) && enabled) {
      requestQuotas();
    }
  });

  pi.on("session_shutdown", () => {
    unsubscribeQuotas?.();
    unsubscribeQuotas = undefined;
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "subBarIntegration",
    });
  });
}
