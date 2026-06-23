import type {
  AuthStorage,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import { getNeuralwattApiKey } from "../../../lib/env";
import { fetchNeuralwattModels } from "../../../lib/neuralwatt-api";
import type { NeuralwattApiModel } from "../../../types/models-api";

// Per-ID overrides for known models. The authenticated /v1/models endpoint
// exposes pricing and capabilities, but some Pi-specific behavior (thinking
// levels, compat flags) has to be supplied by hand.
const MODEL_OVERRIDES: Partial<
  Record<string, Partial<ProviderModelConfig>>
> = {};

function buildModel(apiModel: NeuralwattApiModel): ProviderModelConfig {
  const meta = apiModel.metadata;
  const reasoning = meta?.capabilities.reasoning ?? false;
  const override = MODEL_OVERRIDES[apiModel.id];

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
    maxTokens: meta?.limits.max_output_tokens ?? 65536,
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
    return applyOverride(model, override);
  }

  return model;
}

function applyOverride(
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
 * Load the full live model list from Neuralwatt's authenticated /v1/models.
 *
 * The provider ships no hardcoded model list — this is the single source of
 * truth, invoked on demand by `/neuralwatt:fetch`. The old hidden/public split
 * is gone: every model the API returns (minus deprecated / pricing-tbd) becomes
 * a registered model. Returns an empty array on a missing key or fetch failure
 * so the caller can surface the error.
 */
export async function loadNeuralwattModels(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderModelConfig[]> {
  const apiKey = await getNeuralwattApiKey(authStorage);
  if (!apiKey) return [];

  const result = await fetchNeuralwattModels(apiKey, signal);
  if (!result.success) return [];

  return result.data
    .filter(
      (model) =>
        !model.metadata?.deprecated && !model.metadata?.pricing.pricing_tbd,
    )
    .map(buildModel);
}
