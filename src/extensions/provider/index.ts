import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import {
  configLoader,
  emitConfigUpdated,
  NEURALWATT_CONFIG_UPDATED_EVENT,
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
} from "../../types/quota-events";
import { fetchQuotas } from "../../utils/quotas";
import { normalizeNeuralwattContextOverflowError } from "./context-overflow";
import { buildModelList, fetchNeuralwattModels, getNeuralwattModels } from "./models";
import { buildQuotasFromHeaders, fetchRequestedQuotas } from "./quota-store";

const HEADER_EMIT_THROTTLE_MS = 5_000;

function registerNeuralwattProvider(
  pi: ExtensionAPI,
  fetchedModels?: ProviderModelConfig[],
): void {
  const { includeLegacyModelIds } = configLoader.getConfig();
  const baseModels = fetchedModels ?? getNeuralwattModels();

  pi.registerProvider("neuralwatt", {
    baseUrl: "https://api.neuralwatt.com/v1",
    apiKey: "$NEURALWATT_API_KEY",
    api: "openai-completions",
    authHeader: true,
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    },
    models: buildModelList(baseModels, includeLegacyModelIds),
  });
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  const fetchedModels = await fetchNeuralwattModels();
  registerNeuralwattProvider(pi, fetchedModels);

  const loadedFeatures = new Set<NeuralwattFeatureId>();

  // Register settings in the provider so it is always available.
  registerNeuralwattSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, () => {
    registerNeuralwattProvider(pi, fetchedModels);
  });

  let lastHeaderEmitAt = 0;
  let quotaRequestInFlight = false;

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

  pi.on("message_end", (event, ctx) => {
    const message = normalizeNeuralwattContextOverflowError(
      event.message,
      ctx.model?.provider,
    );
    if (!message) return;
    return { message };
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== "neuralwatt") return;
    const quotas = buildQuotasFromHeaders(event.headers);
    if (!quotas) return;
    emitQuotas(quotas, "header");
  });

  pi.events.on(NEURALWATT_QUOTAS_REQUEST_EVENT, async (data: unknown) => {
    if (quotaRequestInFlight) return;
    quotaRequestInFlight = true;
    try {
      const quotas = await fetchRequestedQuotas(data);
      if (quotas)
        pi.events.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, {
          quotas,
          source: "api",
        });
    } finally {
      quotaRequestInFlight = false;
    }
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as { feature: NeuralwattFeatureId };
    loadedFeatures.add(feature);
  });

  pi.on("session_start", async (_event, ctx) => {
    for (const message of configLoader.drainMessages()) {
      ctx.ui.notify(message, "warning");
    }

    loadedFeatures.clear();
    pi.events.emit(NEURALWATT_EXTENSIONS_REQUEST_EVENT, undefined);
    emitConfigUpdated(pi);

    if (ctx.model?.provider !== "neuralwatt") return;
    const apiKey = await getNeuralwattApiKey(ctx.modelRegistry.authStorage);
    if (!apiKey) return;
    const quotaResult = await fetchQuotas(apiKey);
    if (quotaResult.success) emitQuotas(quotaResult.data.quotas, "api");
  });
}
