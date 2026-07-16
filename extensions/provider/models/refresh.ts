import type {
  Api,
  Model,
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { loadHiddenModels } from "./hidden";
import { buildLegacyNeuralwattModels } from "./legacy";
import { NEURALWATT_MODELS } from "./public-models";

const PROVIDER_ID = "neuralwatt";
const BASE_URL = "https://api.neuralwatt.com/v1";
const API = "openai-completions" as const;

export interface RefreshNeuralwattModelsOptions {
  includeLegacyModelIds: boolean;
  includeHiddenModels: boolean;
  loadHidden?: typeof loadHiddenModels;
}

function configuredModels(
  includeLegacyModelIds: boolean,
): ProviderModelConfig[] {
  return includeLegacyModelIds
    ? [...NEURALWATT_MODELS, ...buildLegacyNeuralwattModels()]
    : [...NEURALWATT_MODELS];
}

function toStoredModel(model: ProviderModelConfig): Model<Api> {
  return {
    ...model,
    provider: PROVIDER_ID,
    api: model.api ?? API,
    baseUrl: model.baseUrl ?? BASE_URL,
  };
}

function toProviderModel(model: Model<Api>): ProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    reasoning: model.reasoning,
    thinkingLevelMap: model.thinkingLevelMap,
    input: [...model.input],
    cost: structuredClone(model.cost),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    headers: model.headers
      ? Object.fromEntries(
          Object.entries(model.headers).filter(
            (entry): entry is [string, string] => entry[1] !== null,
          ),
        )
      : undefined,
    compat: model.compat ? structuredClone(model.compat) : undefined,
  };
}

function dedupeHiddenModels(
  hiddenModels: ProviderModelConfig[],
  baselineModels: ProviderModelConfig[],
): ProviderModelConfig[] {
  const baselineIds = new Set(baselineModels.map((model) => model.id));
  return hiddenModels.filter((model) => !baselineIds.has(model.id));
}

function cachedHiddenModels(
  stored: ModelsStoreEntry | undefined,
): ProviderModelConfig[] {
  if (!stored) return [];

  const allStaticIds = new Set(configuredModels(true).map((model) => model.id));

  return stored.models
    .filter(
      (model) => model.provider === PROVIDER_ID && !allStaticIds.has(model.id),
    )
    .map(toProviderModel);
}

async function persistModels(
  context: RefreshModelsContext,
  models: ProviderModelConfig[],
): Promise<void> {
  await context.store.write({
    models: models.map(toStoredModel),
    checkedAt: Date.now(),
  });
}

/** Refresh the complete Neuralwatt catalog with Pi-managed persistence. */
export async function refreshNeuralwattModels(
  context: RefreshModelsContext,
  options: RefreshNeuralwattModelsOptions,
): Promise<ProviderModelConfig[]> {
  const baseline = configuredModels(options.includeLegacyModelIds);
  const stored = await context.store.read();

  if (!options.includeHiddenModels) {
    await persistModels(context, baseline);
    return baseline;
  }

  const cachedHidden = dedupeHiddenModels(cachedHiddenModels(stored), baseline);
  const cachedCatalog = [...baseline, ...cachedHidden];

  if (!context.allowNetwork || context.signal?.aborted) {
    return cachedCatalog;
  }

  const apiKey =
    context.credential?.type === "api_key" ? context.credential.key : undefined;
  if (!apiKey) return cachedCatalog;

  const hidden = await (options.loadHidden ?? loadHiddenModels)(
    apiKey,
    context.signal,
  );
  if (context.signal?.aborted) return cachedCatalog;
  if (!hidden) {
    throw new Error("Neuralwatt model catalog refresh failed");
  }

  const catalog = [...baseline, ...dedupeHiddenModels(hidden, baseline)];
  await persistModels(context, catalog);
  return catalog;
}
