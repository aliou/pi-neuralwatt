import type { Provider } from "@earendil-works/pi-ai";
import type { NeuralwattApi } from "../../src/config";
import { createAnthropicMessagesApi } from "./api/anthropic-messages";
import { createOpenAiCompletionsApi } from "./api/openai-completions";
import type { NeuralwattApiHandler } from "./api/types";
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
} from "./models/catalog";
import {
  createNeuralwattRefreshModels,
  type FetchNeuralwattApiModels,
} from "./models/refresh";
import type { AnyStreamSimple } from "./stream-simple";

export { NEURALWATT_API_KEY_ENV, NEURALWATT_BASE_URL, NEURALWATT_PROVIDER_ID };

export interface NeuralwattProviderOptions {
  /** Active API surface; resolved once. Changes need a `/reload`. */
  api?: NeuralwattApi;
  openAiStreamSimple?: AnyStreamSimple;
  messagesStreamSimple?: AnyStreamSimple;
}

function createApiHandler(
  api: NeuralwattApi,
  options?: NeuralwattProviderOptions,
): NeuralwattApiHandler {
  if (api === "anthropic-messages") {
    return createAnthropicMessagesApi({
      streamSimple: options?.messagesStreamSimple,
    });
  }
  return createOpenAiCompletionsApi({
    streamSimple: options?.openAiStreamSimple,
  });
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
  );

  return {
    id: NEURALWATT_PROVIDER_ID,
    name: "Neuralwatt",
    baseUrl: NEURALWATT_BASE_URL,
    headers: NEURALWATT_REQUEST_HEADERS,
    auth: {
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
          return { auth: { apiKey: "" }, source: "anonymous" };
        },
      },
    },
    getModels: () => handler.stampModels(canonicalModels),
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
