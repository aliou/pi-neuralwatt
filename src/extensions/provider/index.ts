import { getApiProvider } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
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
import { fetchQuotas } from "../../lib/neuralwatt-api";
import type { NeuralwattQuotas } from "../../types/quota-api";
import {
  NEURALWATT_QUOTAS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattQuotasUpdatedPayload,
} from "../../types/quota-events";
import { normalizeNeuralwattContextOverflowError } from "./context-overflow";
import { loadCachedModels, loadNeuralwattModels } from "./models";
import { writeModelsCache } from "./models/cache";
import { buildQuotasFromHeaders, fetchRequestedQuotas } from "./quota-store";
import {
  type NeuralwattRateLimitInfo,
  normalizeNeuralwattRateLimitError,
  parseRateLimitHeaders,
} from "./rate-limit-error";
import { updateQuotasFromSseComment } from "./sse-quotas";
import { wrapNeuralwattStreamSimple } from "./stream-simple";

const HEADER_EMIT_THROTTLE_MS = 5_000;

function missingAuthMessage(): string {
  return "Neuralwatt needs an API key to fetch models. Add credentials to ~/.pi/agent/auth.json or set the NEURALWATT_API_KEY environment variable.";
}

function registerNeuralwattProvider(
  pi: ExtensionAPI,
  onSseQuota: (line: string) => void,
  models: ProviderModelConfig[] = [],
): void {
  const config: Parameters<ExtensionAPI["registerProvider"]>[1] = {
    baseUrl: "https://api.neuralwatt.com/v1",
    apiKey: "$NEURALWATT_API_KEY",
    api: "openai-completions",
    authHeader: true,
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    },
    // `registerProvider` replaces the provider's entire model list in one shot
    // when `models` is provided, so each call here is an atomic "clear then
    // write" — no separate unregister step is needed.
    models,
  };

  const provider = getApiProvider("openai-completions");
  const baseStreamSimple = provider?.streamSimple;
  if (baseStreamSimple) {
    config.streamSimple = wrapNeuralwattStreamSimple(
      baseStreamSimple as never,
      onSseQuota,
    ) as never;
  }

  pi.registerProvider("neuralwatt", config);
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let latestQuotas: NeuralwattQuotas | undefined;
  let pendingRateLimitInfo: NeuralwattRateLimitInfo | undefined;

  // The provider ships with no hardcoded model list and does not discover
  // models on session_start. The last fetched list is restored synchronously
  // from disk so the provider (and its scoped models) shows up in the picker
  // immediately — no API call is made on startup. `/neuralwatt:fetch` is the
  // only thing that hits the network and rewrites the cache.
  let models: ProviderModelConfig[] = loadCachedModels();

  const handleSseQuota = (line: string) => {
    const quotas = updateQuotasFromSseComment(latestQuotas, line);
    if (!quotas || quotas === latestQuotas) return;
    latestQuotas = quotas;
    pi.events.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, {
      quotas,
      source: "sse",
    });
  };

  registerNeuralwattProvider(pi, handleSseQuota, models);

  const loadedFeatures = new Set<NeuralwattFeatureId>();

  // Register settings in the provider so it is always available.
  registerNeuralwattSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  pi.registerCommand("neuralwatt:fetch", {
    description: "Fetch the live model list from Neuralwatt and refresh the provider",
    handler: async (_args, ctx) => {
      const apiKey = await getNeuralwattApiKey(ctx.modelRegistry.authStorage);
      if (!apiKey) {
        ctx.ui.notify(missingAuthMessage(), "warning");
        return;
      }

      ctx.ui.notify("Fetching models from Neuralwatt…", "info");
      const fetched = await loadNeuralwattModels(ctx.modelRegistry.authStorage);
      if (fetched.length === 0) {
        ctx.ui.notify(
          "No models fetched from Neuralwatt. Check your network and API key, then retry.",
          "error",
        );
        return;
      }

      // Atomic replace: registerProvider swaps the provider's model list for
      // `fetched` in a single call — clear + write in one go. Then persist so
      // the next launch resolves instantly without a fetch.
      models = fetched;
      await writeModelsCache(models);
      registerNeuralwattProvider(pi, handleSseQuota, models);
      ctx.ui.notify(`Fetched ${fetched.length} models from Neuralwatt.`, "info");
    },
  });

  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, () => {
    // Re-register so config toggles (stream wrapper, baseUrl) take effect
    // against the currently-fetched model list.
    registerNeuralwattProvider(pi, handleSseQuota, models);
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
    latestQuotas = quotas;
    pi.events.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, { quotas, source });
  }

  // Stored rate-limit info from the most recent 429 response.
  // Used in message_end to rewrite the generic error text with
  // actionable details from Neuralwatt's response headers.

  pi.on("message_end", (event, ctx) => {
    // Rewrite rate-limit errors with layer-specific details
    if (
      pendingRateLimitInfo &&
      event.message.role === "assistant" &&
      event.message.stopReason === "error" &&
      (event.message.provider === "neuralwatt" ||
        ctx.model?.provider === "neuralwatt")
    ) {
      const message = normalizeNeuralwattRateLimitError(
        event.message,
        pendingRateLimitInfo,
      );
      pendingRateLimitInfo = undefined;
      return { message };
    }

    // Fallback for 429s where no layer-specific headers were captured. The
    // streamSimple wrap (wrapNeuralwattStreamSimple) already formats a
    // detailed message via formatRateLimitError when it captures headers;
    // detect that case by the `"429 rate limit:"` prefix it emits and leave
    // it untouched. This branch only fires for genuinely headerless 429s
    // (e.g. anonymous playground limits, or a 429 from infra in front of
    // Neuralwatt), since after_provider_response cannot observe 429s — the
    // OpenAI SDK throws before Pi's onResponse hook runs.
    if (
      event.message.role === "assistant" &&
      event.message.stopReason === "error" &&
      (event.message.provider === "neuralwatt" ||
        ctx.model?.provider === "neuralwatt") &&
      event.message.errorMessage?.includes("429") &&
      !event.message.errorMessage.startsWith("429 rate limit:")
    ) {
      return {
        message: normalizeNeuralwattRateLimitError(event.message, {
          layer: "unknown",
          detail:
            "Neuralwatt rate limit reached, but Pi did not receive layer-specific rate-limit headers. Retry shortly.",
        }),
      };
    }

    // Rewrite context overflow errors for Pi's native compaction
    const overflowMessage = normalizeNeuralwattContextOverflowError(
      event.message,
      ctx.model?.provider,
    );
    if (!overflowMessage) return;
    return { message: overflowMessage };
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== "neuralwatt") return;

    // Capture rate-limit headers from 429 responses for message_end rewriting
    if (event.status === 429) {
      pendingRateLimitInfo = parseRateLimitHeaders(event.headers);
    } else {
      pendingRateLimitInfo = undefined;
    }

    const quotas = buildQuotasFromHeaders(event.headers);
    if (!quotas) return;
    emitQuotas(quotas, "header");
  });

  pi.events.on(NEURALWATT_QUOTAS_REQUEST_EVENT, async (data: unknown) => {
    if (quotaRequestInFlight) return;
    quotaRequestInFlight = true;
    try {
      const quotas = await fetchRequestedQuotas(data);
      if (quotas) emitQuotas(quotas, "api");
    } finally {
      quotaRequestInFlight = false;
    }
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as { feature: NeuralwattFeatureId };
    loadedFeatures.add(feature);
  });

  pi.on("session_start", async (_event, ctx) => {
    pendingRateLimitInfo = undefined;
    for (const message of configLoader.drainMessages()) {
      ctx.ui.notify(message, "warning");
    }

    loadedFeatures.clear();
    pi.events.emit(NEURALWATT_EXTENSIONS_REQUEST_EVENT, undefined);
    emitConfigUpdated(pi);

    // No model discovery at startup. Run /neuralwatt:fetch to populate the
    // provider's model list for this session.

    if (ctx.model?.provider !== "neuralwatt") return;
    const apiKey = await getNeuralwattApiKey(ctx.modelRegistry.authStorage);
    if (!apiKey) return;
    const quotaResult = await fetchQuotas(apiKey);
    if (quotaResult.success) emitQuotas(quotaResult.data.quotas, "api");
  });
}
