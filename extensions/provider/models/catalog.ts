import type { NeuralwattApiModel } from "../../../src/types/models-api";
import {
  buildThinkingLevelMap,
  NEURALWATT_SYSTEM_ONE_API,
  type NeuralwattClassifierModel,
  type NeuralwattCompiledModel,
  type ProviderChatModelConfig,
  resolveMaxTokens,
  type ThinkingLevelMap,
} from "./build";
import { NEURALWATT_MODELS } from "./public-models";
import { withReasoningReplay } from "./reasoning-replay";

export type NeuralwattChatModel = NeuralwattCompiledModel;

export type NeuralwattModel = NeuralwattChatModel | NeuralwattClassifierModel;

export function isNeuralwattClassifierModel(
  model: NeuralwattModel,
): model is NeuralwattClassifierModel {
  return model.type === "classifier";
}

export function partitionNeuralwattModels(models: readonly NeuralwattModel[]): {
  chat: NeuralwattChatModel[];
  classifiers: NeuralwattClassifierModel[];
} {
  const chat: NeuralwattChatModel[] = [];
  const classifiers: NeuralwattClassifierModel[] = [];
  for (const model of models) {
    if (isNeuralwattClassifierModel(model)) {
      classifiers.push(model);
    } else {
      chat.push(model);
    }
  }
  return { chat, classifiers };
}

function apiModelToClassifierModel(
  model: NeuralwattApiModel,
): NeuralwattClassifierModel {
  const meta = model.metadata;
  if (!meta)
    throw new Error(
      `Neuralwatt API returned model "${model.id}" without metadata`,
    );

  return {
    type: "classifier",
    api: NEURALWATT_SYSTEM_ONE_API,
    id: model.id,
    name: meta.display_name ?? model.id,
    input: meta.capabilities.vision
      ? (["text", "image"] as const)
      : (["text"] as const),
    cost: {
      input: meta.pricing.input_per_million,
      output: meta.pricing.output_per_million,
      cacheRead: meta.pricing.cached_input_per_million ?? 0,
      cacheWrite: meta.pricing.cached_output_per_million ?? 0,
    },
    contextWindow: model.max_model_len,
  };
}

function apiModelToProviderModel(
  model: NeuralwattApiModel,
): NeuralwattChatModel {
  const meta = model.metadata;
  if (!meta)
    throw new Error(
      `Neuralwatt API returned model "${model.id}" without metadata`,
    );

  const reasoning = meta.capabilities.reasoning;

  const compat: NonNullable<ProviderChatModelConfig["compat"]> = {
    supportsDeveloperRole: meta.capabilities.developer_role,
    maxTokensField: "max_tokens",
    // No compat overrides: the former Qwen3.8 chat-template override was dead
    // code (keyed by `huggingface_id`, never by `model.id`) and redundant —
    // `reasoning_effort: "none"` disables thinking on that model, which the
    // thinkingLevelMap already emits for `off`. Verified live 2026-10-07.
  };

  const contextWindow = model.max_model_len;

  const result: NeuralwattChatModel = {
    id: model.id,
    name: meta.display_name ?? model.id,
    reasoning,
    input: meta.capabilities.vision
      ? (["text", "image"] as const)
      : (["text"] as const),
    cost: {
      input: meta.pricing.input_per_million,
      output: meta.pricing.output_per_million,
      cacheRead: meta.pricing.cached_input_per_million ?? 0,
      cacheWrite: meta.pricing.cached_output_per_million ?? 0,
    },
    contextWindow,
    maxTokens: resolveMaxTokens(meta.limits.max_output_tokens, contextWindow),
    compat,
  };

  if (reasoning) {
    result.thinkingLevelMap = buildThinkingLevelMap(
      meta.reasoning,
    ) as ThinkingLevelMap;
    // Kept for anthropic-messages stamping, which resolves levels through
    // `effort_aliases`.
    result.reasoningContract = meta.reasoning;
  }

  return withReasoningReplay(result);
}

export function buildNeuralwattProviderModels(): NeuralwattModel[] {
  return NEURALWATT_MODELS.map((model) => withReasoningReplay({ ...model }));
}

export function buildNeuralwattProviderModelsFromApi(
  apiModels: readonly NeuralwattApiModel[],
): NeuralwattModel[] {
  const models = apiModels
    .filter(
      (m) =>
        m.metadata &&
        !m.metadata.deprecated &&
        !m.metadata.pricing.pricing_tbd &&
        !(
          m.metadata.capabilities.task &&
          !["chat", "completions", "decision"].includes(
            m.metadata.capabilities.task,
          )
        ),
    )
    .map((m) =>
      m.metadata?.capabilities.task === "decision"
        ? apiModelToClassifierModel(m)
        : apiModelToProviderModel(m),
    );
  return models;
}

export function buildNeuralwattProviderModelsFromStore(
  storedModels: readonly NeuralwattModel[],
): NeuralwattModel[] {
  // Re-apply the decision table to chat entries so a stale knob persisted by
  // an older build is overwritten on restore. Classifier entries pass through.
  return storedModels.map((model) =>
    isNeuralwattClassifierModel(model)
      ? model
      : withReasoningReplay({ ...model }),
  );
}
