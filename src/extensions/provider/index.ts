import type { AuthStorage, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  emitConfigUpdated,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  type NeuralwattFeatureId,
  registerNeuralwattSettings,
} from "../../config";
import { getNeuralwattApiKey } from "../../lib/env";
import type { NeuralwattQuotas } from "../../types/quota-api";
import {
  NEURALWATT_QUOTAS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattQuotasUpdatedPayload,
  parseQuotaHeaders,
} from "../../types/quota-events";
import { fetchQuotas } from "../../utils/quotas";
import { NEURALWATT_MODELS } from "./models";

export function registerNeuralwattProvider(pi: ExtensionAPI): void {
  pi.registerProvider("neuralwatt", {
    baseUrl: "https://api.neuralwatt.com/v1",
    apiKey: "NEURALWATT_API_KEY",
    api: "openai-completions",
    authHeader: true,
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    },
    models: NEURALWATT_MODELS.map(({ fast: _fast, ...model }) => ({
      ...model,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        ...model.compat,
      },
    })),
  });
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  registerNeuralwattProvider(pi);

  // Track which feature extensions loaded
  const loadedFeatures = new Set<NeuralwattFeatureId>();

  // Register settings (in the provider, so it's always available)
  registerNeuralwattSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  // --- Quota store (event-based) ---
  let lastHeaderEmitAt = 0;
  const HEADER_EMIT_THROTTLE_MS = 5_000;

  function emitQuotas(
    quotas: NeuralwattQuotas,
    source: NeuralwattQuotasUpdatedPayload["source"],
  ): void {
    const now = Date.now();
    if (source === "header" && now - lastHeaderEmitAt < HEADER_EMIT_THROTTLE_MS)
      return;
    if (source === "header") lastHeaderEmitAt = now;
    pi.events.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, { quotas, source });
  }

  // Ingest quotas from response headers
  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== "neuralwatt") return;
    const headerQuotas = parseQuotaHeaders(event.headers);
    if (!headerQuotas) return;

    const quotas: NeuralwattQuotas = {
      snapshot_at: new Date().toISOString(),
      balance: {
        credits_remaining_usd: headerQuotas.allowanceRemainingUsd,
        total_credits_usd: 0,
        credits_used_usd: 0,
        accounting_method: "token",
      },
      usage: {
        lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
        current_month: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
      },
      limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
      subscription:
        headerQuotas.subscriptionPlan !== "none" &&
        headerQuotas.energyRemaining !== undefined
          ? {
              plan: headerQuotas.subscriptionPlan,
              status: "active",
              billing_interval: "month",
              current_period_start: "",
              current_period_end: "",
              auto_renew: false,
              kwh_included: headerQuotas.energyIncluded ?? 0,
              kwh_used: headerQuotas.energyUsed ?? 0,
              kwh_remaining: headerQuotas.energyRemaining,
              in_overage: false,
            }
          : null,
      key: { name: "", allowance: null },
    };

    emitQuotas(quotas, "header");
  });

  // Respond to quota requests from other extensions
  let quotaRequestInFlight = false;
  pi.events.on(NEURALWATT_QUOTAS_REQUEST_EVENT, async (data: unknown) => {
    if (quotaRequestInFlight) return;
    quotaRequestInFlight = true;
    try {
      if (!data || typeof data !== "object") return;
      const { authStorage } = data as { authStorage?: AuthStorage };
      if (!authStorage) return;
      const apiKey = await getNeuralwattApiKey(authStorage);
      if (!apiKey) return;
      const result = await fetchQuotas(apiKey);
      if (result.success) emitQuotas(result.data.quotas, "api");
    } finally {
      quotaRequestInFlight = false;
    }
  });

  // Collect which feature extensions are loaded
  pi.events.on(NEURALWATT_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as { feature: NeuralwattFeatureId };
    loadedFeatures.add(feature);
  });

  // On session start: request extensions to register, then emit config
  pi.on("session_start", async (_event, ctx) => {
    loadedFeatures.clear();
    pi.events.emit(NEURALWATT_EXTENSIONS_REQUEST_EVENT, undefined);
    emitConfigUpdated(pi);

    if (ctx.model?.provider !== "neuralwatt") return;
    const apiKey = await getNeuralwattApiKey(ctx.modelRegistry.authStorage);
    if (!apiKey) return;
    const result = await fetchQuotas(apiKey);
    if (result.success) emitQuotas(result.data.quotas, "api");
  });
}
