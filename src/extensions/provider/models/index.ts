import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { buildLegacyNeuralwattModels } from "./legacy";
import { NEURALWATT_MODELS } from "./public-models";

export { loadCachedHiddenModels, writeHiddenModelsCache } from "./cache";
export { loadHiddenModels } from "./hidden";
export {
  buildLegacyNeuralwattModels,
  LEGACY_MODEL_ALIAS_MAP,
  LEGACY_NEURALWATT_MODEL_IDS,
} from "./legacy";
export { NEURALWATT_MODELS } from "./public-models";

export function getNeuralwattModels(options?: {
  includeLegacyModelIds?: boolean;
}): ProviderModelConfig[] {
  const models: ProviderModelConfig[] = [...NEURALWATT_MODELS];

  if (options?.includeLegacyModelIds) {
    models.push(...buildLegacyNeuralwattModels());
  }

  return models;
}
