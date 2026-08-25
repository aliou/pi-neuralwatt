import type {
  Api,
  Model,
  Provider,
  ProviderStreamOptions,
} from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
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

export const NEURALWATT_PROVIDER_ID = "neuralwatt";
export const NEURALWATT_BASE_URL = "https://api.neuralwatt.com/v1";
export const NEURALWATT_API_KEY_ENV = "NEURALWATT_API_KEY";

const NEURALWATT_REQUEST_HEADERS = {
  Referer: "https://pi.dev",
  "X-Title": "npm:@aliou/pi-neuralwatt",
};

const API = "openai-completions" as const;

function toProviderModels(models: NeuralwattModel[]): Model<Api>[] {
  return models.map((model) => ({
    ...model,
    api: model.api ?? API,
    provider: NEURALWATT_PROVIDER_ID,
    baseUrl: model.baseUrl ?? NEURALWATT_BASE_URL,
    headers: NEURALWATT_REQUEST_HEADERS,
  }));
}

export function createNeuralwattProvider(
  staticModels: NeuralwattModel[],
  fetchApiModels: FetchNeuralwattApiModels,
  streamSimpleOverride?: AnyStreamSimple,
): Provider {
  let liveModels = toProviderModels(staticModels);
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
    getModels: () => liveModels,
    refreshModels: async (context) => {
      const models = await refreshCatalog(context);
      await context.publish({
        update: () => {
          liveModels = toProviderModels(models);
        },
      });
    },
    stream: (model, context, options) =>
      stream(model, context, options as ProviderStreamOptions | undefined),
    streamSimple: streamSimpleOverride ?? streamSimple,
  };
}
