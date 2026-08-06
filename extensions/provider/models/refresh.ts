import type {
  Api,
  Model,
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import {
  persistModels,
  readStoredModels,
} from "../../../src/refresh-store-compat";
import {
  ALIAS_NEURALWATT_MODEL_IDS,
  buildAliasNeuralwattModels,
} from "./aliases";
import {
  EARLY_ACCESS_NEURALWATT_MODELS,
  loadEarlyAccessModels,
} from "./early-access";
import { buildLegacyNeuralwattModels } from "./legacy";
import { NEURALWATT_MODELS } from "./public-models";

const PROVIDER_ID = "neuralwatt";
const BASE_URL = "https://api.neuralwatt.com/v1";
const API = "openai-completions" as const;

export interface RefreshNeuralwattModelsOptions {
  includeLegacyModelIds: boolean;
  includeAliasedModelIds: boolean;
  includeEarlyAccessModels: boolean;
  loadEarlyAccess?: typeof loadEarlyAccessModels;
}

function configuredModels(
  includeLegacyModelIds: boolean,
  includeAliasedModelIds: boolean,
  extraCanonicalModels: ProviderModelConfig[] = [],
): ProviderModelConfig[] {
  const canonicalModels = [...NEURALWATT_MODELS, ...extraCanonicalModels];
  const models: ProviderModelConfig[] = [...canonicalModels];

  if (includeLegacyModelIds) {
    models.push(...buildLegacyNeuralwattModels());
  }

  if (includeAliasedModelIds) {
    models.push(...buildAliasNeuralwattModels(canonicalModels));
  }

  return models;
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

function dedupeEarlyAccessModels(
  earlyAccessModels: ProviderModelConfig[],
  baselineModels: ProviderModelConfig[],
): ProviderModelConfig[] {
  const baselineIds = new Set(baselineModels.map((model) => model.id));
  return earlyAccessModels.filter((model) => !baselineIds.has(model.id));
}

function configuredEarlyAccessModels(
  discoveredModels: ProviderModelConfig[],
  baselineModels: ProviderModelConfig[],
): ProviderModelConfig[] {
  const hardcodedIds = new Set(
    EARLY_ACCESS_NEURALWATT_MODELS.map((model) => model.id),
  );
  return dedupeEarlyAccessModels(
    [
      ...EARLY_ACCESS_NEURALWATT_MODELS,
      ...discoveredModels.filter((model) => !hardcodedIds.has(model.id)),
    ],
    baselineModels,
  );
}

function cachedEarlyAccessModels(
  stored: ModelsStoreEntry | undefined,
): ProviderModelConfig[] {
  if (!stored) return [];

  const allStaticIds = new Set(
    configuredModels(true, true).map((model) => model.id),
  );

  return stored.models
    .filter(
      (model) =>
        model.provider === PROVIDER_ID &&
        !allStaticIds.has(model.id) &&
        !ALIAS_NEURALWATT_MODEL_IDS.has(model.id),
    )
    .map(toProviderModel);
}

function persistCatalog(
  context: RefreshModelsContext,
  models: ProviderModelConfig[],
): Promise<boolean> {
  return persistModels(context, {
    models: models.map(toStoredModel),
    checkedAt: Date.now(),
  });
}

/** Refresh the complete Neuralwatt catalog with Pi-managed persistence. */
export async function refreshNeuralwattModels(
  context: RefreshModelsContext,
  options: RefreshNeuralwattModelsOptions,
): Promise<ProviderModelConfig[]> {
  const baseline = configuredModels(
    options.includeLegacyModelIds,
    options.includeAliasedModelIds,
  );
  const stored = await readStoredModels(context);

  if (!options.includeEarlyAccessModels) {
    await persistCatalog(context, baseline);
    return baseline;
  }

  const cachedEarlyAccess = configuredEarlyAccessModels(
    cachedEarlyAccessModels(stored),
    baseline,
  );
  const cachedCatalog = configuredModels(
    options.includeLegacyModelIds,
    options.includeAliasedModelIds,
    cachedEarlyAccess,
  );

  if (!context.allowNetwork || context.signal?.aborted) {
    return cachedCatalog;
  }

  const apiKey =
    context.credential?.type === "api_key" ? context.credential.key : undefined;
  if (!apiKey) return cachedCatalog;

  const earlyAccess = await (options.loadEarlyAccess ?? loadEarlyAccessModels)(
    apiKey,
    context.signal,
  );
  if (context.signal?.aborted) return cachedCatalog;
  if (!earlyAccess) {
    throw new Error("Neuralwatt model catalog refresh failed");
  }

  const catalog = configuredModels(
    options.includeLegacyModelIds,
    options.includeAliasedModelIds,
    configuredEarlyAccessModels(earlyAccess, baseline),
  );
  context.signal?.throwIfAborted();
  await persistCatalog(context, catalog);
  return catalog;
}
