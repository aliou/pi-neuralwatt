import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { NeuralwattApiModel } from "../../../src/types/models-api";
import {
  buildThinkingLevelMap,
  resolveMaxTokens,
  type ThinkingLevelMap,
} from "./build";
import { NEURALWATT_MODELS } from "./public-models";

export type NeuralwattModel = ProviderModelConfig;

// Chat-template thinking: the API exposes a `reasoning` block, but the
// underlying mechanism is chat_template_kwargs, so Pi needs the mapping.
const COMPAT_OVERRIDES: Partial<
  Record<string, Partial<NonNullable<ProviderModelConfig["compat"]>>>
> = {
  "Qwen/Qwen3.8-27B-FP8": {
    thinkingFormat: "chat-template",
    chatTemplateKwargs: {
      enable_thinking: { $var: "thinking.enabled" },
    },
  },
};

const HARDCODED_ALIASES: Record<string, string> = {
  "moonshotai/Kimi-K2.7-Code": "kimi-k2.7-code",
  "Qwen/Qwen3.6-35B-A3B": "qwen3.6-35b",
  "deepseek-ai/DeepSeek-V4-Flash": "deepseek-v4-flash",
};

function isVariantId(id: string): boolean {
  return id.includes("-fast") || id.includes("-flex") || id.includes("-short");
}

function apiModelToProviderModel(model: NeuralwattApiModel): NeuralwattModel {
  const meta = model.metadata;
  if (!meta)
    throw new Error(
      `Neuralwatt API returned model "${model.id}" without metadata`,
    );

  const reasoning = meta.capabilities.reasoning;

  const compat: NonNullable<ProviderModelConfig["compat"]> = {
    supportsDeveloperRole: meta.capabilities.developer_role,
    maxTokensField: "max_tokens",
  };
  if (reasoning) compat.requiresReasoningContentOnAssistantMessages = true;
  Object.assign(compat, COMPAT_OVERRIDES[model.id]);

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
  }

  return result;
}

function buildAliases(
  models: NeuralwattModel[],
  apiModels: readonly NeuralwattApiModel[],
): NeuralwattModel[] {
  const existingIds = new Set(models.map((m) => m.id));
  const aliases: NeuralwattModel[] = [];
  const seen = new Set<string>();

  const addAlias = (aliasId: string, canonicalId: string): void => {
    if (seen.has(aliasId) || existingIds.has(aliasId)) return;
    const canonical = models.find((m) => m.id === canonicalId);
    if (!canonical) return;
    seen.add(aliasId);
    aliases.push({
      ...canonical,
      id: aliasId,
      name: `${canonical.name} (alias ID)`,
    });
  };

  for (const [aliasId, canonicalId] of Object.entries(HARDCODED_ALIASES)) {
    addAlias(aliasId, canonicalId);
  }

  for (const apiModel of apiModels) {
    const hfId = apiModel.metadata?.huggingface_id;
    if (!hfId || hfId === apiModel.id || isVariantId(apiModel.id)) continue;
    addAlias(hfId, apiModel.id);
  }

  return aliases;
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
        // Exclude non-chat models (e.g. embeddings) by task
        !(
          m.metadata.capabilities.task &&
          !["chat", "completions"].includes(m.metadata.capabilities.task)
        ),
    )
    .map(apiModelToProviderModel);
  return [...models, ...buildAliases(models, apiModels)];
}

export function buildNeuralwattProviderModelsFromStore(
  storedModels: readonly NeuralwattModel[],
): NeuralwattModel[] {
  return storedModels.map((model) => ({ ...model }));
}
