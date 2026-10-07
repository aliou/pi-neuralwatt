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

/** Chat model configs; the only kind the chat API surfaces can stamp. */
export type NeuralwattChatModel = NeuralwattCompiledModel;

/**
 * Canonical catalog entries: chat models plus decision models compiled as
 * classifiers. The offline fallback (`public-models.ts`) is chat-only;
 * classifier entries only ever come from a keyed `/v1/models` catalog.
 */
export type NeuralwattModel = NeuralwattChatModel | NeuralwattClassifierModel;

export function isNeuralwattClassifierModel(
  model: NeuralwattModel,
): model is NeuralwattClassifierModel {
  return model.type === "classifier";
}

/**
 * Split a canonical catalog into its chat and classifier halves. Chat API
 * surfaces stamp chat entries only; classifiers are stamped by
 * `stampClassifierModels` (`api/system-one.ts`) so they land in
 * `getAllModels()` but never in `getModels()`.
 */
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

/**
 * Compile a `task: "decision"` catalog entry into a classifier model. Decision
 * models serve one-shot classifications over `/v1/systemone`; they never
 * stream chat, so they get no reasoning/thinking/compat plumbing.
 */
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

/**
 * Offline fallback catalog. Contains chat models only: anonymous catalogs
 * never list decision models, so there is no fallback classifier.
 */
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
        // Decision models compile to classifiers; exclude every other
        // non-chat task (e.g. embeddings).
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
