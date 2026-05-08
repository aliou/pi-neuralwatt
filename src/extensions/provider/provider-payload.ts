import type { NeuralwattModelConfig } from "./models";

export function buildModelsPayload(models: NeuralwattModelConfig[]) {
  return models.map(({ fast: _fast, ...model }) => ({
    ...model,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens" as const,
      ...model.compat,
    },
  }));
}
