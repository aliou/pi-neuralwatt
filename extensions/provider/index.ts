import { getApiProvider } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../src/config";
import {
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_REQUEST_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
  type NeuralwattFeatureId,
  type NeuralwattQuotasUpdatedPayload,
} from "../../src/events";
import { fetchQuotas } from "../../src/lib/neuralwatt-api";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import { getNeuralwattApiKey } from "../_shared/auth";
import { registerNeuralwattSettings } from "./commands/settings";
import { normalizeNeuralwattContextOverflowError } from "./context-overflow";
import {
  getNeuralwattModels,
  loadCachedHiddenModels,
  loadHiddenModels,
  writeHiddenModelsCache,
} from "./models";
import { buildQuotasFromHeaders, fetchRequestedQuotas } from "./quota-store";
import {
  type NeuralwattRateLimitInfo,
  normalizeNeuralwattRateLimitError,
  parseRateLimitHeaders,
} from "./rate-limit-error";
import { updateQuotasFromSseComment } from "./sse-quotas";
import { wrapNeuralwattStreamSimple } from "./stream-simple";

const HEADER_EMIT_THROTTLE_MS = 5_000;

function emitConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(NEURALWATT_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}

function registerNeuralwattProvider(
  pi: ExtensionAPI,
  onSseQuota: (line: string) => void,
  hiddenModels: ProviderModelConfig[] = [],
): void {
  const { provider: providerConfig } = configLoader.getConfig();

  const publicModels = getNeuralwattModels({
    includeLegacyModelIds: providerConfig.includeLegacyModelIds,
  });
  const resolvedHiddenModels = providerConfig.includeHiddenModels
    ? dedupeHiddenModels(hiddenModels, publicModels)
    : [];

  const config: Parameters<ExtensionAPI["registerProvider"]>[1] = {
    baseUrl: "https://api.neuralwatt.com/v1",
    apiKey: "$NEURALWATT_API_KEY",
    api: "openai-completions",
    authHeader: true,
    headers: {
      Referer: "https://pi.dev",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    },
    models: [...publicModels, ...resolvedHiddenModels],
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

/**
 * Drop any hidden model whose ID collides with a public or legacy model.
 *
 * Models can graduate from hidden (authenticated /v1/models only) to public
 * (unauthenticated list). When that happens, a stale on-disk cache may still
 * list the now-public ID, which would register it twice and make Pi treat the
 * scoped model as ambiguous ("No models match pattern"). Dedupe against the
 * public list so a stale cache can never shadow a public model.
 */
function dedupeHiddenModels(
  hiddenModels: ProviderModelConfig[],
  publicModels: ProviderModelConfig[],
): ProviderModelConfig[] {
  const publicIds = new Set(publicModels.map((m) => m.id));
  return hiddenModels.filter((m) => !publicIds.has(m.id));
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let latestQuotas: NeuralwattQuotas | undefined;

  // Stale-while-revalidate seed for hidden models.
  //
  // Hidden models are only discoverable by hitting the authenticated
  // `/v1/models` endpoint, which we can do inside `session_start` (Pi does not
  // expose `authStorage` to extension factories). However, Pi validates scoped
  // models (e.g. `neuralwatt/glm-5.2-short`) during startup, *before*
  // `session_start` fires. To avoid "No models match pattern" warnings on saved
  // scoped models, we synchronously restore the previous session's fetch from
  // the on-disk cache so the provider is registered with hidden models at
  // load time. `session_start` then revalidates from the live API and writes
  // the cache back. First run with no cache still warns once.
  let hiddenModels: ProviderModelConfig[] = [];
  if (configLoader.getConfig().provider.includeHiddenModels) {
    hiddenModels = loadCachedHiddenModels();
  }
  let hiddenModelsLoaded = false;
  let hiddenModelsAbort: AbortController | undefined;

  const handleSseQuota = (line: string) => {
    const quotas = updateQuotasFromSseComment(latestQuotas, line);
    if (!quotas || quotas === latestQuotas) return;
    latestQuotas = quotas;
    pi.events.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, {
      quotas,
      source: "sse",
    });
  };

  registerNeuralwattProvider(pi, handleSseQuota, hiddenModels);

  const loadedFeatures = new Set<NeuralwattFeatureId>();

  // Register settings in the provider so it is always available.
  registerNeuralwattSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, () => {
    // Toggle may have enabled hidden models since startup. Seed from the disk
    // cache so previously discovered models are available immediately without
    // waiting for the next session_start revalidation.
    if (
      configLoader.getConfig().provider.includeHiddenModels &&
      !hiddenModelsLoaded &&
      hiddenModels.length === 0
    ) {
      hiddenModels = loadCachedHiddenModels();
    }
    registerNeuralwattProvider(pi, handleSseQuota, hiddenModels);
  });

  pi.on("session_shutdown", () => {
    hiddenModelsAbort?.abort();
    hiddenModelsAbort = undefined;
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
  let pendingRateLimitInfo: NeuralwattRateLimitInfo | undefined;

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
    const messages = [...new Set(configLoader.drainMessages())];
    if (messages.length > 0) {
      ctx.ui.notify(messages.join("\n"), "info");
    }

    loadedFeatures.clear();
    pi.events.emit(NEURALWATT_EXTENSIONS_REQUEST_EVENT, undefined);
    emitConfigUpdated(pi);

    if (
      !hiddenModelsLoaded &&
      configLoader.getConfig().provider.includeHiddenModels
    ) {
      hiddenModelsLoaded = true;
      hiddenModelsAbort?.abort();
      hiddenModelsAbort = new AbortController();
      const fetched = await loadHiddenModels(
        ctx.modelRegistry.authStorage,
        hiddenModelsAbort.signal,
      );
      // Persist for the next startup so scoped models resolve without
      // warnings on Pi's subsequent launches. Always write the cache (even
      // when empty) and re-register, so graduated or removed hidden models
      // are purged from both the cache and the provider's model list.
      hiddenModels = fetched;
      await writeHiddenModelsCache(hiddenModels);
      if (!hiddenModelsAbort.signal.aborted) {
        registerNeuralwattProvider(pi, handleSseQuota, hiddenModels);
      }
    }

    if (ctx.model?.provider !== "neuralwatt") return;
    const apiKey = await getNeuralwattApiKey(ctx.modelRegistry.authStorage);
    if (!apiKey) return;
    const quotaResult = await fetchQuotas(apiKey);
    if (quotaResult.success) emitQuotas(quotaResult.data.quotas, "api");
  });
}
