import type { Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createProvider } from "@earendil-works/pi-ai/models";
import { classify, stampClassifierModels } from "../src/api/system-one";
import type { NeuralwattApiHandler } from "../src/api/types";
import type { NeuralwattApi } from "../src/config";
import { resolveApiBaseUrl } from "../src/config/resolve";
import {
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../src/constants";
import { fetchNeuralwattModels } from "../src/lib/neuralwatt-api";
import { NEURALWATT_SYSTEM_ONE_API } from "../src/models/build";
import {
  buildNeuralwattProviderModels,
  buildNeuralwattProviderModelsFromApi,
  buildNeuralwattProviderModelsFromStore,
  type NeuralwattModel,
  partitionNeuralwattModels,
} from "../src/models/catalog";
import { createNeuralwattRefreshModels } from "../src/models/refresh";
import { createApiHandler, createNeuralwattApiKeyAuth } from "../src/provider";
import type { AnyStreamSimple } from "../src/stream-simple";
import {
  type ProvenanceOptions,
  provenanceRequestHeaders,
  withProvenanceHeaders,
} from "./headers";

export {
  NEURALWATT_API_KEY_ENV,
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
} from "../src/constants";
export {
  CONVERSATION_ID_HEADER,
  DEFAULT_ATTRIBUTION_URL,
  type ProvenanceOptions,
  provenanceRequestHeaders,
  withProvenanceHeaders,
} from "./headers";

export interface NeuralwattProviderOptions {
  api?: NeuralwattApi;
  baseUrl?: string;
  provenance?: ProvenanceOptions;
  openAiStreamSimple?: AnyStreamSimple;
  messagesStreamSimple?: AnyStreamSimple;
}

function fetchCatalogModels(baseUrl: string) {
  return async (apiKey: string | undefined, signal?: AbortSignal) => {
    const result = await fetchNeuralwattModels(apiKey, baseUrl, signal);
    if (!result.success) {
      throw new Error("Neuralwatt models API request failed");
    }
    return result.data;
  };
}

function toStreams(handler: NeuralwattApiHandler): ProviderStreams {
  return {
    stream: (model, context, options) =>
      handler.stream(model, context, options as never),
    streamSimple: (model, context, options) =>
      handler.streamSimple(model, context, options),
  };
}

export default function createNeuralwattProvider(
  options: NeuralwattProviderOptions = {},
): Provider<"openai-completions" | "anthropic-messages"> {
  const api = options.api ?? "openai-completions";
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const handler = createApiHandler(api, {
    ...options,
    baseUrl,
    openAiUpstream: openAICompletionsApi(),
    messagesUpstream: anthropicMessagesApi(),
  });
  const staticModels = buildNeuralwattProviderModels();
  const refreshCatalog = createNeuralwattRefreshModels(
    staticModels,
    fetchCatalogModels(baseUrl),
    buildNeuralwattProviderModelsFromApi,
    buildNeuralwattProviderModelsFromStore,
    baseUrl,
  );
  const { Referer: _referer, ...defaultHeaders } = NEURALWATT_REQUEST_HEADERS;
  const provenanceHeaders = provenanceRequestHeaders(options.provenance);
  const headers = { ...defaultHeaders, ...provenanceHeaders };

  const stamp = (models: readonly NeuralwattModel[]) => {
    const partitioned = partitionNeuralwattModels(models);
    return [
      ...handler.stampModels(partitioned.chat),
      ...stampClassifierModels(partitioned.classifiers, baseUrl),
    ].map((model) => ({ ...model, headers }));
  };

  return createProvider({
    id: NEURALWATT_PROVIDER_ID,
    name: "Neuralwatt",
    baseUrl,
    headers,
    auth: createNeuralwattApiKeyAuth(),
    models: stamp(staticModels),
    fetchModels: async (context) => {
      const models = await refreshCatalog({
        ...context,
        publish: async () => true,
      });
      return stamp(models);
    },
    api: withProvenanceHeaders(toStreams(handler), provenanceHeaders),
    classifiers: { [NEURALWATT_SYSTEM_ONE_API]: { classify } },
  }) as Provider<"openai-completions" | "anthropic-messages">;
}
