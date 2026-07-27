import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { fetchNeuralwattModels } from "../../../src/lib/neuralwatt-api";
import type { NeuralwattApiModel } from "../../../src/types/models-api";
import { NEURALWATT_MODELS } from "./public-models";

// Hidden aliases that work for authorized accounts but are omitted from the
// authenticated /v1/models response. Keep these gated by includeHiddenModels.
// Move an entry to public-models.ts once Neuralwatt advertises it publicly.
export const HIDDEN_NEURALWATT_MODELS: ProviderModelConfig[] = [
  // DeepSeek V4 Flash Canary - early-access 284B/13B-active MoE served on B200s.
  // Neuralwatt omits it from the authenticated catalog. Context and runtime
  // capabilities were verified directly; pricing follows DeepSeek's upstream
  // rates until Neuralwatt publishes model metadata.
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash (Canary)",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.14,
      output: 0.28,
      cacheRead: 0.0028,
      cacheWrite: 0,
    },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    thinkingLevelMap: {
      off: "none",
      minimal: "low",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: null,
      max: "max",
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
];

// Per-ID overrides for known hidden models. The authenticated /v1/models endpoint
// exposes pricing and capabilities, but some Pi-specific behavior (thinking levels,
// compat flags) has to be supplied by hand.
// Previously hidden models that have since gone public now live in public-models.ts.
const HIDDEN_MODEL_OVERRIDES: Partial<
  Record<string, Partial<ProviderModelConfig>>
> = {};

function buildHiddenModel(apiModel: NeuralwattApiModel): ProviderModelConfig {
  const meta = apiModel.metadata;
  const reasoning = meta?.capabilities.reasoning ?? false;
  const override = HIDDEN_MODEL_OVERRIDES[apiModel.id];

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
    return applyHiddenOverride(model, override);
  }

  return model;
}

function applyHiddenOverride(
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
 * Load hidden models from the authenticated /v1/models endpoint.
 *
 * Hidden models are any models returned by the API that are not already part of
 * the public hardcoded list. If the API key is missing or the request fails, an
 * `undefined` distinguishes an unavailable/failed request from a successful
 * empty hidden-model list, allowing refresh callers to preserve stale cache.
 */
export async function loadHiddenModels(
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
    .map(buildHiddenModel);
}
