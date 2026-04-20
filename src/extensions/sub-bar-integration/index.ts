import type {
  AuthStorage,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  type NeuralwattConfigUpdatedPayload,
} from "../../config";
import type { NeuralwattQuotas } from "../../types/quota-api";
import {
  NEURALWATT_QUOTAS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattQuotasUpdatedPayload,
} from "../../types/quota-events";
import {
  percentCreditsRemaining,
  percentEnergyRemaining,
} from "../../utils/quota-bar";
import { formatKwh, formatUsd } from "../../utils/quota-format";
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

  let enabled = configLoader.getConfig().subBarIntegration;
  let subCoreReady = false;
  let currentProvider: string | undefined;
  let currentAuthStorage: AuthStorage | undefined;
  let currentContext: ExtensionContext | undefined;

  // Listen for config changes at runtime
  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.subBarIntegration;
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
    if (!currentAuthStorage) return;
    pi.events.emit(NEURALWATT_QUOTAS_REQUEST_EVENT, {
      authStorage: currentAuthStorage,
    });
  }

  pi.events.on(NEURALWATT_QUOTAS_UPDATED_EVENT, (data: unknown) => {
    if (!isActive() || !subCoreReady || !enabled) return;
    if (!data || typeof data !== "object") return;
    const { quotas } = data as NeuralwattQuotasUpdatedPayload;
    emitUsage(quotas);

    if (currentContext?.hasUI) {
      currentContext.ui.setStatus(
        "neuralwatt-usage",
        formatStatus(quotas, currentContext.ui.theme),
      );
    }
  });

  pi.events.on("sub-core:ready", () => {
    subCoreReady = true;
  });

  pi.on("session_start", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentAuthStorage = ctx.modelRegistry.authStorage;
    currentContext = ctx;
  });

  pi.on("model_select", async (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentAuthStorage = ctx.modelRegistry.authStorage;
    currentContext = ctx;

    if (subCoreReady && isActive() && enabled) {
      requestQuotas();
    }
  });

  pi.on("session_before_switch", (_event, ctx) => {
    currentProvider = ctx.model?.provider;
    currentAuthStorage = ctx.modelRegistry.authStorage;
    currentContext = ctx;
  });

  pi.on("session_shutdown", () => {
    currentProvider = undefined;
    currentAuthStorage = undefined;
    currentContext = undefined;
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "subBarIntegration",
    });
  });
}
