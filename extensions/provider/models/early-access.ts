import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { fetchNeuralwattModels } from "../../../src/lib/neuralwatt-api";
import type { NeuralwattApiModel } from "../../../src/types/models-api";
import { resolveMaxTokens } from "./build";
import { NEURALWATT_MODELS } from "./public-models";

// Pre-release models. Neuralwatt ships these to authorized accounts before they
// reach the public /v1/models response; most go public eventually. Keep them
// gated by includeEarlyAccessModels and hardcode entries so they remain
// available from the offline catalog.
// Move an entry to public-models.ts once Neuralwatt advertises it publicly.
export const EARLY_ACCESS_NEURALWATT_MODELS: ProviderModelConfig[] = [];

// Per-ID overrides for known early-access models. The authenticated /v1/models
// endpoint exposes pricing and capabilities, but some Pi-specific behavior
// (thinking levels, compat flags) has to be supplied by hand.
// Models that have since gone public now live in public-models.ts.
const EARLY_ACCESS_MODEL_OVERRIDES: Partial<
  Record<string, Partial<ProviderModelConfig>>
> = {};

function buildEarlyAccessModel(
  apiModel: NeuralwattApiModel,
): ProviderModelConfig {
  const meta = apiModel.metadata;
  const reasoning = meta?.capabilities.reasoning ?? false;
  const override = EARLY_ACCESS_MODEL_OVERRIDES[apiModel.id];

  const compat: NonNullable<ProviderModelConfig["compat"]> = {
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
  };
  if (reasoning) {
    compat.requiresReasoningContentOnAssistantMessages = true;
  }

  const model: ProviderModelConfig = {
    id: apiModel.id,
    name: meta?.display_name ?? apiModel.id,
    reasoning,
    input: (meta?.capabilities.vision ? ["text", "image"] : ["text"]) as (
      | "text"
      | "image"
    )[],
    cost: {
      input: meta?.pricing.input_per_million ?? 0,
      output: meta?.pricing.output_per_million ?? 0,
      cacheRead: meta?.pricing.cached_input_per_million ?? 0,
      cacheWrite: meta?.pricing.cached_output_per_million ?? 0,
    },
    contextWindow: apiModel.max_model_len,
    maxTokens: resolveMaxTokens(
      meta?.limits.max_output_tokens,
      apiModel.max_model_len,
    ),
    compat,
  };

  if (reasoning) {
    model.thinkingLevelMap = override?.thinkingLevelMap ?? {
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    };
  }

  if (override) {
    return applyEarlyAccessOverride(model, override);
  }

  return model;
}

function applyEarlyAccessOverride(
  model: ProviderModelConfig,
  override: Partial<ProviderModelConfig>,
): ProviderModelConfig {
  const result: ProviderModelConfig = { ...model };

  if (override.name !== undefined) result.name = override.name;
  if (override.reasoning !== undefined) result.reasoning = override.reasoning;
  if (override.input !== undefined) result.input = override.input;
  if (override.thinkingLevelMap !== undefined) {
    result.thinkingLevelMap = override.thinkingLevelMap;
  }
  if (override.contextWindow !== undefined) {
    result.contextWindow = override.contextWindow;
  }
  if (override.maxTokens !== undefined) result.maxTokens = override.maxTokens;
  if (override.cost !== undefined) {
    result.cost = { ...model.cost, ...override.cost };
  }
  if (override.compat !== undefined) {
    result.compat = { ...model.compat, ...override.compat };
  }

  return result;
}

/**
 * Load early-access models from the authenticated /v1/models endpoint.
 *
 * Early-access models are any models returned by the API that are not already
 * part of the public hardcoded list. If the API key is missing or the request
 * fails, an `undefined` distinguishes an unavailable/failed request from a
 * successful empty list, allowing refresh callers to preserve stale cache.
 */
export async function loadEarlyAccessModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProviderModelConfig[] | undefined> {
  if (!apiKey) return undefined;

  const result = await fetchNeuralwattModels(apiKey, signal);
  if (!result.success) return undefined;

  const publicIds = new Set(NEURALWATT_MODELS.map((model) => model.id));

  return result.data
    .filter(
      (model) =>
        !model.metadata?.deprecated && !model.metadata?.pricing.pricing_tbd,
    )
    .filter((model) => !publicIds.has(model.id))
    .map(buildEarlyAccessModel);
}
