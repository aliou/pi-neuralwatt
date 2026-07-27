import type {
  Api,
  Model,
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { HIDDEN_NEURALWATT_MODELS } from "./hidden";
import { NEURALWATT_MODELS } from "./public-models";
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

const deepseekV4Flash = HIDDEN_NEURALWATT_MODELS.find(
  (model) => model.id === "deepseek-v4-flash",
);

if (!deepseekV4Flash) {
  throw new Error("deepseek-v4-flash hidden model fixture is missing");
}

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
  it("persists hardcoded hidden models when discovery is empty", async () => {
    const { context, writes } = createContext();

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
      loadHidden: async () => [],
    });

    expect(models).toContainEqual(deepseekV4Flash);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.models).toContainEqual(storedModel(deepseekV4Flash));
  });

  it("preserves the DeepSeek V4 Flash runtime configuration", async () => {
    const { context } = createContext();

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
      loadHidden: async () => [],
    });

    expect(models.find((model) => model.id === "deepseek-v4-flash")).toEqual({
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash (Canary)",
      reasoning: true,
      input: ["text", "image"],
      cost: {
        input: 0.14,
        output: 0.28,
        cacheRead: 0.0028,
        cacheWrite: 0,
      },
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      thinkingLevelMap: {
        off: "none",
        minimal: "low",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: null,
        max: "max",
      },
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        requiresReasoningContentOnAssistantMessages: true,
      },
    });
  });

  it("omits hardcoded hidden models when discovery is disabled", async () => {
    const { context } = createContext();

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: false,
    });

    expect(models.some((model) => model.id === deepseekV4Flash.id)).toBe(false);
  });

  it("keeps public models authoritative on hidden ID collisions", async () => {
    const { context } = createContext();
    const publicModel = NEURALWATT_MODELS[0];
    if (!publicModel) throw new Error("public model fixture is missing");

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: true,
      loadHidden: async () => [
        { ...hiddenModel, id: publicModel.id, name: "Hidden collision" },
      ],
    });

    expect(models.filter((model) => model.id === publicModel.id)).toEqual([
      publicModel,
    ]);
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

  it("purges hidden models when discovery is disabled", async () => {
    const { context, writes } = createContext({
      stored: { models: [storedModel(hiddenModel)], checkedAt: 1 },
    });

    const models = await refreshNeuralwattModels(context, {
      includeLegacyModelIds: false,
      includeHiddenModels: false,
    });

    expect(models.some((model) => model.id === hiddenModel.id)).toBe(false);
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
