import type {
  Provider,
  ProviderAuth,
  ProviderStreams,
} from "@earendil-works/pi-ai";
import { createAnthropicMessagesApi } from "./api/anthropic-messages";
import { createOpenAiCompletionsApi } from "./api/openai-completions";
import { classify, stampClassifierModels } from "./api/system-one";
import type { NeuralwattApiHandler } from "./api/types";
import type { NeuralwattApi } from "./config";
import {
  NEURALWATT_API_KEY_ENV,
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "./constants";
import type { NeuralwattModel } from "./models/catalog";
import {
  buildNeuralwattProviderModelsFromApi,
  buildNeuralwattProviderModelsFromStore,
  partitionNeuralwattModels,
} from "./models/catalog";
import {
  createNeuralwattRefreshModels,
  type FetchNeuralwattApiModels,
} from "./models/refresh";
import type { AnyStreamSimple } from "./stream-simple";

export { NEURALWATT_API_KEY_ENV, NEURALWATT_BASE_URL, NEURALWATT_PROVIDER_ID };

export function createNeuralwattApiKeyAuth(): ProviderAuth {
  return {
    apiKey: {
      name: "Neuralwatt API key",
      login: async (interaction) => ({
        type: "api_key",
        key: await interaction.prompt({
          type: "secret",
          message: "Enter Neuralwatt API key",
        }),
      }),
      check: async ({ ctx, credential }) => {
        if (credential?.type === "api_key" && credential.key) {
          return { type: "api_key", source: "stored credential" };
        }
        if (await ctx.env(NEURALWATT_API_KEY_ENV)) {
          return { type: "api_key", source: NEURALWATT_API_KEY_ENV };
        }
        return { type: "api_key", source: "anonymous" };
      },
      resolve: async ({ ctx, credential, signal }) => {
        signal.throwIfAborted();
        if (credential?.type === "api_key" && credential.key) {
          return {
            auth: { apiKey: credential.key },
            env: credential.env,
            source: "stored credential",
          };
        }
        const envKey = await ctx.env(NEURALWATT_API_KEY_ENV);
        signal.throwIfAborted();
        if (envKey) {
          return { auth: { apiKey: envKey }, source: NEURALWATT_API_KEY_ENV };
        }
        // pi-ai rejects empty keys before dispatch; "-" is the neutral
        // placeholder that gateways strip or replace server-side.
        return { auth: { apiKey: "-" }, source: "anonymous" };
      },
    },
  };
}

export interface NeuralwattProviderOptions {
  /** Active API surface; resolved once. Changes need a `/reload`. */
  api?: NeuralwattApi;
  baseUrl?: string | (() => string);
  openAiUpstream?: ProviderStreams;
  messagesUpstream?: ProviderStreams;
  toolsOptOut?: () => boolean;
  openAiStreamSimple?: AnyStreamSimple;
  messagesStreamSimple?: AnyStreamSimple;
}

export function createApiHandler(
  api: NeuralwattApi,
  options?: NeuralwattProviderOptions,
): NeuralwattApiHandler {
  const baseUrl = resolveBaseUrl(options);
  if (api === "anthropic-messages") {
    return createAnthropicMessagesApi({
      upstream: options?.messagesUpstream,
      baseUrl,
      streamSimple: options?.messagesStreamSimple,
    });
  }
  return createOpenAiCompletionsApi({
    upstream: options?.openAiUpstream,
    baseUrl,
    toolsOptOut: options?.toolsOptOut,
    streamSimple: options?.openAiStreamSimple,
  });
}

function resolveBaseUrl(options?: NeuralwattProviderOptions): string {
  const value =
    typeof options?.baseUrl === "function"
      ? options.baseUrl()
      : options?.baseUrl;
  return value ?? NEURALWATT_BASE_URL;
}

export function createNeuralwattProvider(
  staticModels: NeuralwattModel[],
  fetchApiModels: FetchNeuralwattApiModels,
  options?: NeuralwattProviderOptions,
): Provider {
  const handler = createApiHandler(
    options?.api ?? "openai-completions",
    options,
  );
  let canonicalModels = staticModels;
  const refreshCatalog = createNeuralwattRefreshModels(
    staticModels,
    fetchApiModels,
    buildNeuralwattProviderModelsFromApi,
    buildNeuralwattProviderModelsFromStore,
    () => resolveBaseUrl(options),
  );

  return {
    id: NEURALWATT_PROVIDER_ID,
    name: "Neuralwatt",
    get baseUrl() {
      return resolveBaseUrl(options);
    },
    headers: NEURALWATT_REQUEST_HEADERS,
    auth: createNeuralwattApiKeyAuth(),
    getModels: () =>
      createApiHandler(
        options?.api ?? "openai-completions",
        options,
      ).stampModels(partitionNeuralwattModels(canonicalModels).chat),
    getAllModels: () => {
      const { chat, classifiers } = partitionNeuralwattModels(canonicalModels);
      return [
        ...createApiHandler(
          options?.api ?? "openai-completions",
          options,
        ).stampModels(chat),
        ...stampClassifierModels(classifiers, resolveBaseUrl(options)),
      ];
    },
    classify: (model, context, options) => classify(model, context, options),
    refreshModels: async (context) => {
      const models = await refreshCatalog(context);
      await context.publish({
        update: () => {
          canonicalModels = models;
        },
      });
    },
    stream: (model, context, streamOptions) =>
      handler.stream(model, context, streamOptions as never),
    streamSimple: (model, context, simpleOptions) =>
      handler.streamSimple(model, context, simpleOptions),
  };
}
