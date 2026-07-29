import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { buildAliasNeuralwattModels } from "./aliases";
import { buildLegacyNeuralwattModels } from "./legacy";
import { NEURALWATT_MODELS } from "./public-models";

export {
  ALIAS_MODEL_MAP,
  ALIAS_NEURALWATT_MODEL_IDS,
  buildAliasNeuralwattModels,
} from "./aliases";

export {
  EARLY_ACCESS_NEURALWATT_MODELS,
  loadEarlyAccessModels,
} from "./early-access";
export {
  buildLegacyNeuralwattModels,
  LEGACY_MODEL_ALIAS_MAP,
  LEGACY_NEURALWATT_MODEL_IDS,
} from "./legacy";
export { NEURALWATT_MODELS } from "./public-models";
export { refreshNeuralwattModels } from "./refresh";

export function getNeuralwattModels(options?: {
  includeLegacyModelIds?: boolean;
  includeAliasedModelIds?: boolean;
}): ProviderModelConfig[] {
  const models: ProviderModelConfig[] = [...NEURALWATT_MODELS];

  if (options?.includeLegacyModelIds) {
    models.push(...buildLegacyNeuralwattModels());
  }

  if (options?.includeAliasedModelIds) {
    models.push(...buildAliasNeuralwattModels());
  }

  return models;
}
