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
import { isStaleExtensionCtxError } from "../_shared/stale-ctx";
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

  // Each session registers its own listener on its own event bus. We track
  // unsubs in a set rather than a single slot because in-process subagents
  // (e.g. @gotgenes/pi-subagents) load the same extension module for a sibling
  // session: a single shared variable would let the child's session_start
  // clobber (and unsubscribe) the parent's still-live listener. Each session's
  // bus is separate, so leaving the previous listener in place is safe; real
  // session replacement fires session_shutdown (below) to clean up, and a
  // subagent's listener self-cleans when its ctx goes stale (see the catch
  // below — its dispose() does not emit session_shutdown).
  const quotaUnsubs = new Set<() => void>();
  function clearQuotaListeners(): void {
    for (const unsub of quotaUnsubs) unsub();
    quotaUnsubs.clear();
  }

  pi.on("session_start", async (_event, ctx) => {
    const unsub = pi.events.on(
      NEURALWATT_QUOTAS_UPDATED_EVENT,
      (data: unknown) => {
        if (!subCoreReady || !enabled) return;
        if (!data || typeof data !== "object") return;
        try {
          if (!isActive(ctx)) return;
          const { quotas } = data as NeuralwattQuotasUpdatedPayload;
          emitUsage(quotas);
          ctx.ui.setStatus(
            "neuralwatt-usage",
            formatStatus(quotas, ctx.ui.theme),
          );
        } catch (err) {
          // ctx was invalidated (owning session disposed, e.g. an in-process
          // subagent tearing down while its async SSE quota reader still drains).
          // Stop listening on behalf of this dead session.
          if (isStaleExtensionCtxError(err)) {
            unsub();
            quotaUnsubs.delete(unsub);
          } else {
            throw err;
          }
        }
      },
    );
    quotaUnsubs.add(unsub);

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
    clearQuotaListeners();
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "subBarIntegration",
    });
  });
}
