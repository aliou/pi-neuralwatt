// omp (https://omp.sh) provider registration.
//
// omp's `pi.registerProvider(name, config)` takes a ProviderConfig, not the
// pi-ai `Provider` object pi accepts, and it reserves built-in api names when a
// custom `streamSimple` is supplied (api-registry `assertCustomApiName`). The
// wrapped Neuralwatt stream therefore registers under a provider-scoped api id,
// and the provider's models carry that id for omp's dispatch
// (`stream.ts` `getCustomApi(model.api)`); the stream delegates to omp's own
// built-in stream via the model's real api. Stamping and the per-api payload
// injectors come from the same `createApiHandler` the pi path uses, so the
// anthropic origin-root baseUrl, compat flags and reasoning controls cannot
// drift between hosts.
import type { OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { streamSimple as ompStreamSimple } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import type { NeuralwattApi } from "../../src/config";
import { configuredApiBaseUrl } from "../../src/config/loader";
import { fetchNeuralwattModels } from "../../src/lib/neuralwatt-api";
import {
  NEURALWATT_API_KEY_ENV,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "./constants";
import {
  buildNeuralwattProviderModelsFromApi,
  type NeuralwattModel,
  partitionNeuralwattModels,
} from "./models/catalog";
import type { FetchNeuralwattApiModels } from "./models/refresh";
import { createApiHandler } from "./provider";
import {
  type AnyStreamSimple,
  type NeuralwattStreamCallbacks,
  wrapNeuralwattStreamSimple,
} from "./stream-simple";

export interface RegisterOmpProviderOptions {
  staticModels: NeuralwattModel[];
  api: NeuralwattApi;
  fetchApiModels: FetchNeuralwattApiModels;
  streamCallbacks: NeuralwattStreamCallbacks;
}

/**
 * Register Neuralwatt on omp. Static catalog models are the offline fallback;
 * `fetchDynamicModels` refreshes them from the `/v1/models` endpoint.
 */
export function registerNeuralwattProviderForOmp(
  pi: ExtensionAPI,
  options: RegisterOmpProviderOptions,
): void {
  const { staticModels, api, fetchApiModels, streamCallbacks } = options;
  const customApi = `${NEURALWATT_PROVIDER_ID}-${api}`;

  // omp dispatches our custom api inside its own per-provider in-flight
  // limiter (`withProviderInFlightLimit`, keyed by model.provider). Delegating
  // to omp's top-level streamSimple would acquire a second slot under the same
  // provider while the outer one is held: deadlock at a limit of 1, halved
  // concurrency otherwise. An empty maxInFlightRequests map makes the inner
  // `resolveProviderInFlightLimit` read `{}` and skip the limiter.
  const streamViaOmp: AnyStreamSimple = (model, context, simpleOptions) =>
    (ompStreamSimple as unknown as AnyStreamSimple)(
      { ...model, api },
      context,
      // `maxInFlightRequests` is omp-only (absent from pi-ai 1.1.0's
      // SimpleStreamOptions): an empty map makes the nested call skip omp's
      // per-provider limiter, which the custom-api dispatch already holds.
      {
        ...simpleOptions,
        maxInFlightRequests: {},
      } as unknown as typeof simpleOptions,
    );

  const streamWithQuotas = wrapNeuralwattStreamSimple(
    streamViaOmp,
    streamCallbacks,
    // omp has no `before_provider_headers` / `message_end` rewrite path, so
    // take the transport-level equivalents here (see stream-simple.ts).
    { conversationIdHeader: true, rewriteErrorBody: true },
  );

  // Identical handler to the pi path: stampModels applies the api-specific
  // baseUrl/compat, streamSimple applies the reasoning payload injector, then
  // delegates to the omp stream above.
  const handler = createApiHandler(api, {
    api,
    openAiStreamSimple: streamWithQuotas,
    messagesStreamSimple: streamWithQuotas,
  });

  // Re-tag the stamped models with the provider-scoped api id so omp routes
  // them back through this extension's custom api.
  const stampModels = (models: NeuralwattModel[]) =>
    handler
      .stampModels(partitionNeuralwattModels(models).chat)
      .map((model) => ({ ...model, api: customApi }));

  // omp's ProviderConfig is a superset of pi's (fetchDynamicModels replaces
  // refreshModels, and `oauth.login` may return a plain API-key string); the
  // cast bridges the two extension host type spaces.
  const config = {
    baseUrl: configuredApiBaseUrl(),
    api: customApi,
    apiKey: NEURALWATT_API_KEY_ENV,
    headers: NEURALWATT_REQUEST_HEADERS,
    models: stampModels(staticModels),
    streamSimple: handler.streamSimple,
    // Wires `omp login neuralwatt` / the in-session `/login` picker. omp
    // registers this as an OAuth provider with `id = NEURALWATT_PROVIDER_ID`
    // and persists the returned string through `storeLoginApiKey`, so requests
    // then resolve the stored key before falling back to NEURALWATT_API_KEY
    // (omp treats a provider's `apiKey` as a fallback once `oauth` is set).
    oauth: {
      name: "Neuralwatt",
      login: async (callbacks: OAuthLoginCallbacks) => {
        const key = (
          await callbacks.onPrompt({
            message:
              "Paste your Neuralwatt API key (https://portal.neuralwatt.com)",
            placeholder: "sk-...",
          })
        ).trim();
        if (!key) throw new Error("No Neuralwatt API key provided");

        // `/v1/models` is public but answers 401/403 for an unrecognised
        // Bearer key, so a successful catalog fetch doubles as a credential
        // probe for the paste without spending a completion.
        const models = await fetchNeuralwattModels(key);
        if (!models.success) {
          throw new Error("Invalid Neuralwatt API key");
        }
        return key;
      },
    },
    fetchDynamicModels: async (apiKey: string | undefined) => {
      // omp resolves `apiKey: NEURALWATT_API_KEY` to the literal env-var name
      // when the variable is unset; treat that as anonymous (public catalog).
      const key = apiKey === NEURALWATT_API_KEY_ENV ? undefined : apiKey;
      const live = await fetchApiModels(key);
      return stampModels(buildNeuralwattProviderModelsFromApi(live));
    },
  } as unknown as ProviderConfig;

  pi.registerProvider(NEURALWATT_PROVIDER_ID, config);
}
