import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { NEURALWATT_MODELS } from "./public-models";

// Alternate creator-scoped model IDs that Neuralwatt accepts for active models.
// These are only included when `includeAliasedModelIds` is enabled.
export const ALIAS_MODEL_MAP = {
  "deepseek-ai/DeepSeek-V4-Flash": "deepseek-v4-flash",
  "zai-org/GLM-5.2-FP8": "glm-5.2",
  "moonshotai/Kimi-K2.6": "kimi-k2.6",
  "moonshotai/Kimi-K2.7-Code": "kimi-k2.7-code",
  "Qwen/Qwen3.5-397B-A17B-FP8": "qwen3.5-397b",
  "Qwen/Qwen3.6-35B-A3B": "qwen3.6-35b",
  "nvidia/Gemma-4-31B-IT-NVFP4": "gemma-4-31b",
} as const;

export const ALIAS_NEURALWATT_MODEL_IDS = new Set<string>(
  Object.keys(ALIAS_MODEL_MAP),
);

export function buildAliasNeuralwattModels(
  canonicalModels: ProviderModelConfig[] = NEURALWATT_MODELS,
): ProviderModelConfig[] {
  return Object.entries(ALIAS_MODEL_MAP).flatMap(([aliasId, canonicalId]) => {
    const canonical = canonicalModels.find((model) => model.id === canonicalId);

    if (!canonical) return [];

    return [
      {
        ...canonical,
        id: aliasId,
        name: `${canonical.name} (alias ID)`,
      },
    ];
  });
}
