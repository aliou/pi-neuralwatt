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
import { isStaleExtensionCtxError } from "../_shared/stale-ctx";
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
        if (!enabled) return;
        if (!data || typeof data !== "object") return;
        try {
          if (ctx.model?.provider !== "neuralwatt") return;

          const { quotas } = data as NeuralwattQuotasUpdatedPayload;
          checkQuotas(ctx, quotas);
        } catch (err) {
          // ctx was invalidated (owning session disposed, e.g. an in-process
          // subagent tearing down while its async SSE quota reader still drains).
          // Stop listening on behalf of this dead session; further updates are
          // meaningless once its UI is gone.
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

    if (ctx.model?.provider !== "neuralwatt") return;
    clearAlertState();
  });

  pi.on("session_shutdown", () => {
    clearQuotaListeners();
    clearAlertState();
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaWarnings",
    });
  });
}
