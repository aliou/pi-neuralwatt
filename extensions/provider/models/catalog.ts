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

// Chat-template thinking: the API exposes a `reasoning` block, but the
// underlying mechanism is chat_template_kwargs, so Pi needs the mapping.
const COMPAT_OVERRIDES: Partial<
  Record<string, Partial<NonNullable<ProviderChatModelConfig["compat"]>>>
> = {
  "Qwen/Qwen3.8-27B-FP8": {
    thinkingFormat: "chat-template",
    chatTemplateKwargs: {
      enable_thinking: { $var: "thinking.enabled" },
    },
  },
};

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
    ...COMPAT_OVERRIDES[model.id],
  };

  const contextWindow = model.max_model_len;

  const result: NeuralwattModel = {
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

  return result;
}

export function buildNeuralwattProviderModels(): NeuralwattModel[] {
  return NEURALWATT_MODELS.map((model) => ({ ...model }));
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
  return storedModels.map((model) => ({ ...model }));
}
