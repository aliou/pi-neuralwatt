import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { NEURALWATT_MODELS } from "./public-models";

// Legacy model IDs that should resolve to a canonical public model.
// These are phased out over time and are only included when `includeLegacyModelIds` is enabled.
export const LEGACY_MODEL_ALIAS_MAP = {
  // GLM 5.1 → GLM 5.2
  "glm-5.1": "glm-5.2",
  "glm-5.1-fast": "glm-5.2-fast",
  "zai-org/GLM-5.1-FP8": "glm-5.2",
  // Kimi K2.5 → Kimi K2.7 Code (K2.6 was retired 8/3, redirected to K2.7)
  "moonshotai/Kimi-K2.5": "kimi-k2.7-code",
  "kimi-k2.5-fast": "kimi-k2.7-code-fast",
  // Kimi K2.6 retired 8/3, redirected to Kimi K2.7 Code
  "kimi-k2.6": "kimi-k2.7-code",
  "kimi-k2.6-fast": "kimi-k2.7-code-fast",
  "kimi-k2.6-flex": "kimi-k2.7-code-flex",
  "moonshotai/Kimi-K2.6": "kimi-k2.7-code",
  // Qwen 3.5 retired 8/3, redirected to Qwen 3.6
  "qwen3.5-397b": "qwen3.6-35b",
  "qwen3.5-397b-fast": "qwen3.6-35b-fast",
  "Qwen/Qwen3.5-397B-A17B-FP8": "qwen3.6-35b",
} as const;

export const LEGACY_NEURALWATT_MODEL_IDS = new Set<string>(
  Object.keys(LEGACY_MODEL_ALIAS_MAP),
);

export function buildLegacyNeuralwattModels(): ProviderModelConfig[] {
  return Object.entries(LEGACY_MODEL_ALIAS_MAP).map(
    ([legacyId, canonicalId]) => {
      const canonical = NEURALWATT_MODELS.find(
        (model) => model.id === canonicalId,
      );

      if (!canonical) {
        throw new Error(`Missing canonical model for legacy alias ${legacyId}`);
      }

      return {
        ...canonical,
        id: legacyId,
        name: `${canonical.name} (legacy ID)`,
      };
    },
  );
}
