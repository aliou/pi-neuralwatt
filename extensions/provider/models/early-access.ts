import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { fetchNeuralwattModels } from "../../../src/lib/neuralwatt-api";
import type { NeuralwattApiModel } from "../../../src/types/models-api";
import { buildThinkingLevelMap, resolveMaxTokens } from "./build";
import { NEURALWATT_MODELS } from "./public-models";

// Pre-release models. Neuralwatt ships these to authorized accounts before they
// reach the public /v1/models response; most go public eventually. Keep them
// gated by includeEarlyAccessModels and hardcode entries so they remain
// available from the offline catalog.
// Move an entry to public-models.ts once Neuralwatt advertises it publicly.
export const EARLY_ACCESS_NEURALWATT_MODELS: ProviderModelConfig[] = [
  // Qwen3.8 27B FP8 — pre-release dense 27B VL model with MTP speculative
  // decoding, native 262K context, served on 2x H200. Returned by the
  // authenticated /v1/models catalog but absent from the public endpoint.
  // Binary thinking is toggled through `chat_template_kwargs.enable_thinking`
  // (verified: `enable_thinking: false` suppresses reasoning output); the API
  // exposes no `reasoning` block, so the thinking level map is the high-only
  // fallback with `off: null`.
  // https://huggingface.co/Qwen/Qwen3.8-27B-FP8
  {
    id: "Qwen/Qwen3.8-27B-FP8",
    name: "Qwen 3.8 27B FP8",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.45, output: 3.2, cacheRead: 0.25, cacheWrite: 0 },
    contextWindow: 262_128,
    maxTokens: 65_536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: "chat-template",
      chatTemplateKwargs: {
        enable_thinking: { $var: "thinking.enabled" },
      },
    },
    thinkingLevelMap: { ...buildThinkingLevelMap(undefined) },
  },
];

// Per-ID overrides for known early-access models. The authenticated /v1/models
// endpoint exposes pricing and capabilities, but some Pi-specific behavior
// (compat flags, context window, max tokens) has to be supplied by hand.
// Reasoning config is always derived from the endpoint's `reasoning` block via
// `buildThinkingLevelMap`, so `reasoning` and `thinkingLevelMap` are not part
// of the override shape.
// Models that have since gone public now live in public-models.ts.
const EARLY_ACCESS_MODEL_OVERRIDES: Partial<
  Record<
    string,
    Omit<Partial<ProviderModelConfig>, "reasoning" | "thinkingLevelMap">
  >
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
    // Reasoning levels come straight from the endpoint's `reasoning` block:
    // `supported_efforts` (identity) and `mandatory` (gates `off`). A missing
    // block falls back to a high-only map inside `buildThinkingLevelMap`.
    model.thinkingLevelMap = buildThinkingLevelMap(meta?.reasoning);
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
  if (override.input !== undefined) result.input = override.input;
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

  // `reasoning` and `thinkingLevelMap` are intentionally not overridable:
  // reasoning config is derived from the endpoint's `reasoning` block.

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
