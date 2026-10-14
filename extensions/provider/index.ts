import type {
  ExtensionAPI,
  ModelRegistry,
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
import {
  fetchNeuralwattModels,
  fetchQuotas,
} from "../../src/lib/neuralwatt-api";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import { getNeuralwattApiKey } from "../_shared/auth";
import { getApiProvider, hasPiProviderRuntime } from "../_shared/host-compat";
import { registerNeuralwattSettings } from "./commands/settings";
import { normalizeNeuralwattContextOverflowError } from "./context-overflow";
import { buildNeuralwattProviderModels } from "./models";
import { registerNeuralwattProviderForOmp } from "./omp";
import { createNeuralwattProvider } from "./provider";
import { buildQuotasFromHeaders, fetchRequestedQuotas } from "./quota-store";
import {
  type NeuralwattRateLimitInfo,
  normalizeNeuralwattRateLimitError,
  parseRateLimitHeaders,
} from "./rate-limit-error";
import { updateQuotasFromSseComment } from "./sse-quotas";
import {
  type NeuralwattStreamCallbacks,
  wrapNeuralwattStreamSimple,
} from "./stream-simple";

const HEADER_EMIT_THROTTLE_MS = 5_000;

function emitConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(NEURALWATT_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}

function registerNeuralwattProvider(
  pi: ExtensionAPI,
  streamCallbacks: NeuralwattStreamCallbacks,
): void {
  const staticModels = buildNeuralwattProviderModels();
  const api = configLoader.getConfig().provider.api;
  const fetchApiModels = async (
    apiKey: string | undefined,
    signal?: AbortSignal,
  ) => {
    const result = await fetchNeuralwattModels(apiKey, signal);
    if (!result.success) {
      throw new Error("Neuralwatt models API request failed");
    }
    return result.data;
  };

  // omp has no pi-ai provider runtime (no `getApiProvider`), so it cannot take
  // the pi-ai `Provider` object; it gets a ProviderConfig instead (see omp.ts).
  if (!hasPiProviderRuntime) {
    registerNeuralwattProviderForOmp(pi, {
      staticModels,
      api,
      fetchApiModels,
      streamCallbacks,
    });
    return;
  }

  const apiProvider = getApiProvider("openai-completions");
  const baseStreamSimple = apiProvider?.streamSimple;
  const streamSimple = baseStreamSimple
    ? (wrapNeuralwattStreamSimple(
        baseStreamSimple as never,
        streamCallbacks,
      ) as never)
    : undefined;

  const messagesApiProvider = getApiProvider("anthropic-messages");
  const messagesBaseStreamSimple = messagesApiProvider?.streamSimple;
  const messagesStreamSimple = messagesBaseStreamSimple
    ? (wrapNeuralwattStreamSimple(
        messagesBaseStreamSimple as never,
        streamCallbacks,
      ) as never)
    : undefined;

  pi.registerProvider(
    createNeuralwattProvider(staticModels, fetchApiModels, {
      api,
      openAiStreamSimple: streamSimple,
      messagesStreamSimple,
    }),
  );
}

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  let latestQuotas: NeuralwattQuotas | undefined;

  let lastSseEmitAt = 0;

  const handleSseQuota = (line: string) => {
    const now = Date.now();
    if (now - lastSseEmitAt < HEADER_EMIT_THROTTLE_MS) return;

    const quotas = updateQuotasFromSseComment(latestQuotas, line);
    if (!quotas || quotas === latestQuotas) return;

    lastSseEmitAt = now;
    emitQuotas(quotas, "sse");
  };

  // Rate-limit info captured by the per-request fetch wrapper from the most
  // recent 429 response. Used in message_end to rewrite the generic error
  // text with actionable details from Neuralwatt's response headers.
  let pendingRateLimitInfo: NeuralwattRateLimitInfo | undefined;

  registerNeuralwattProvider(pi, {
    onSseQuota: handleSseQuota,
    onRateLimit: (info) => {
      pendingRateLimitInfo = info;
    },
  });

  const loadedFeatures = new Set<NeuralwattFeatureId>();

  // Register settings in the provider so it is always available.
  registerNeuralwattSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
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

  let currentModelRegistry: ModelRegistry | undefined;

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

    // Fallback for 429s where no layer-specific headers were captured (the
    // fetch wrapper reported `undefined` via onRateLimit, or the 429 came
    // from infra in front of Neuralwatt). The `"429 rate limit:"` prefix
    // guard skips messages the first branch already rewrote. On the
    // openai-completions surface after_provider_response cannot observe
    // 429s — the OpenAI SDK throws before Pi's onResponse hook runs — so
    // this is the only repair path there; on anthropic-messages
    // after_provider_response also feeds pendingRateLimitInfo directly.
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

  // Inject the active Pi session id as a conversation id on every Neuralwatt
  // request so the gateway can correlate requests within a session.
  pi.on("before_provider_headers", (event, ctx) => {
    if (ctx.model?.provider !== "neuralwatt") return;
    event.headers["X-NW-Conversation-ID"] = ctx.sessionManager.getSessionId();
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

  pi.events.on(NEURALWATT_QUOTAS_REQUEST_EVENT, async () => {
    if (quotaRequestInFlight) return;
    quotaRequestInFlight = true;
    try {
      const apiKey = currentModelRegistry
        ? await getNeuralwattApiKey(currentModelRegistry)
        : undefined;
      const quotas = await fetchRequestedQuotas(apiKey);
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
    currentModelRegistry = ctx.modelRegistry;
    pendingRateLimitInfo = undefined;
    const messages = [...new Set(configLoader.drainMessages())];
    if (messages.length > 0) {
      ctx.ui.notify(messages.join("\n"), "info");
    }

    loadedFeatures.clear();
    pi.events.emit(NEURALWATT_EXTENSIONS_REQUEST_EVENT, undefined);
    emitConfigUpdated(pi);

    if (ctx.model?.provider !== "neuralwatt") return;
    const apiKey = await getNeuralwattApiKey(ctx.modelRegistry);
    if (!apiKey) return;
    const quotaResult = await fetchQuotas(apiKey);
    if (quotaResult.success) emitQuotas(quotaResult.data.quotas, "api");
  });

  pi.on("session_shutdown", () => {
    currentModelRegistry = undefined;
  });
}
