import type {
  Api,
  Model,
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { HIDDEN_NEURALWATT_MODELS } from "./hidden";
import { refreshNeuralwattModels } from "./refresh";

const hiddenModel: ProviderModelConfig = {
  id: "hidden/model",
  name: "Hidden Model",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 8_192,
};

function storedModel(model: ProviderModelConfig): Model<Api> {
  return {
    ...model,
    provider: "neuralwatt",
    api: model.api ?? "openai-completions",
    baseUrl: model.baseUrl ?? "https://api.neuralwatt.com/v1",
  };
}

function createContext(options?: {
  allowNetwork?: boolean;
  stored?: ModelsStoreEntry;
}): {
  context: RefreshModelsContext;
  writes: ModelsStoreEntry[];
} {
  const writes: ModelsStoreEntry[] = [];
  const context: RefreshModelsContext = {
    allowNetwork: options?.allowNetwork ?? true,
    credential: { type: "api_key", key: "test-key" },
    store: {
      read: async () => options?.stored,
      write: async (entry) => {
        writes.push(entry);
      },
      delete: async () => {},
    },
  };
  return { context, writes };
}

describe("refreshNeuralwattModels", () => {
  it("defines the API-omitted Gemma runtime contract", () => {
    const gemma = HIDDEN_NEURALWATT_MODELS.find(
      (model) => model.id === "gemma-4-31b",
    );

    expect(gemma).toMatchObject({
      name: "Gemma 4 31B",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0.14, output: 0.4, cacheRead: 0.035, cacheWrite: 0 },
      contextWindow: 262128,
      maxTokens: 131072,
      thinkingLevelMap: { medium: "medium" },
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        thinkingFormat: "chat-template",
        chatTemplateKwargs: {
          enable_thinking: { $var: "thinking.enabled" },
        },
      },
    });
  });

  it("restores cached hidden models with current public models offline", async () => {
    const { context, writes } = createContext({
      allowNetwork: false,
      stored: { models: [storedModel(hiddenModel)], checkedAt: 1 },
    });

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
    });

    expect(models.some((model) => model.id === hiddenModel.id)).toBe(true);
    expect(models.length).toBeGreaterThan(1);
    expect(writes).toHaveLength(0);
  });

  it("persists the complete refreshed catalog", async () => {
    const { context, writes } = createContext();

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
      loadHidden: async () => [hiddenModel],
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.models).toHaveLength(models.length);
    expect(writes[0]?.models.some((model) => model.id === hiddenModel.id)).toBe(
      true,
    );
    expect(writes[0]?.models.some((model) => model.id !== hiddenModel.id)).toBe(
      true,
    );
  });

  it("persists hardcoded hidden models omitted from discovery", async () => {
    const { context, writes } = createContext();

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
      loadHidden: async () => [],
    });

    for (const hidden of HIDDEN_NEURALWATT_MODELS) {
      expect(models.some((model) => model.id === hidden.id)).toBe(true);
      expect(writes[0]?.models.some((model) => model.id === hidden.id)).toBe(
        true,
      );
    }
  });

  it("purges hidden models when discovery is disabled", async () => {
    const { context, writes } = createContext({
      stored: { models: [storedModel(hiddenModel)], checkedAt: 1 },
    });

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: false,
    });

    expect(models.some((model) => model.id === hiddenModel.id)).toBe(false);
    for (const hidden of HIDDEN_NEURALWATT_MODELS) {
      expect(models.some((model) => model.id === hidden.id)).toBe(false);
    }
    expect(writes[0]?.models).toHaveLength(models.length);
    expect(writes[0]?.models.some((model) => model.id === hiddenModel.id)).toBe(
      false,
    );
  });

  it("preserves the stale cache when a network refresh fails", async () => {
    const stored = { models: [storedModel(hiddenModel)], checkedAt: 1 };
    const { context, writes } = createContext({ stored });

    await expect(
      refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeHiddenModels: true,
        loadHidden: async () => undefined,
      }),
    ).rejects.toThrow("catalog refresh failed");
    expect(writes).toHaveLength(0);

    const offline = createContext({ allowNetwork: false, stored });
    const models = await refreshNeuralwattModels(offline.context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
    });
    expect(models.some((model) => model.id === hiddenModel.id)).toBe(true);
  });
});
