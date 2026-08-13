import type {
  Api,
  Model,
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { NEURALWATT_MODELS } from "./public-models";
import { refreshNeuralwattModels } from "./refresh";

// Dummy hardcoded early-access model injected via vi.mock so the refresh
// tests can verify that hardcoded EARLY_ACCESS_NEURALWATT_MODELS are present
// when the option is enabled, even when discovery returns an empty list.
const { dummyHardcodedEarlyAccessModel } = vi.hoisted(() => {
  const dummyHardcodedEarlyAccessModel: ProviderModelConfig = {
    id: "early-access/hardcoded-dummy",
    name: "Hardcoded Early Access Dummy",
    reasoning: false,
    input: ["text"],
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
  return { dummyHardcodedEarlyAccessModel };
});

vi.mock("./early-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./early-access")>();
  return {
    ...actual,
    EARLY_ACCESS_NEURALWATT_MODELS: [dummyHardcodedEarlyAccessModel],
  };
});

const earlyAccessModel: ProviderModelConfig = {
  id: "early-access/model",
  name: "Early Access Model",
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
    stored: options?.stored,
    publish: async (publication) => {
      if (publication.persist) writes.push(publication.persist);
      return true;
    },
    signal: new AbortController().signal,
  };
  return { context, writes };
}

describe("refreshNeuralwattModels", () => {
  it("persists hardcoded early-access models when discovery is empty", async () => {
    const { context, writes } = createContext();

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => [],
      })) ?? [];

    expect(models).toContainEqual(dummyHardcodedEarlyAccessModel);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.models).toContainEqual(
      storedModel(dummyHardcodedEarlyAccessModel),
    );
  });

  it("omits hardcoded early-access models when the option is disabled", async () => {
    const { context } = createContext();

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: false,
      })) ?? [];

    expect(
      models.some((model) => model.id === dummyHardcodedEarlyAccessModel.id),
    ).toBe(false);
  });

  it("omits early-access models when discovery is disabled", async () => {
    const { context } = createContext({
      stored: { models: [storedModel(earlyAccessModel)], checkedAt: 1 },
    });

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: false,
      })) ?? [];

    expect(models.some((model) => model.id === earlyAccessModel.id)).toBe(
      false,
    );
  });

  it("includes aliases for active models when enabled", async () => {
    const { context, writes } = createContext();

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: true,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => [],
      })) ?? [];

    expect(models.some((model) => model.id === "zai-org/GLM-5.2-FP8")).toBe(
      true,
    );
    expect(
      writes[0]?.models.some((model) => model.id === "zai-org/GLM-5.2-FP8"),
    ).toBe(true);
  });

  it("keeps public models authoritative on early-access ID collisions", async () => {
    const { context } = createContext();
    const publicModel = NEURALWATT_MODELS[0];
    if (!publicModel) throw new Error("public model fixture is missing");

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => [
          {
            ...earlyAccessModel,
            id: publicModel.id,
            name: "Early access collision",
          },
        ],
      })) ?? [];

    expect(models.filter((model) => model.id === publicModel.id)).toEqual([
      publicModel,
    ]);
  });

  it("restores cached early-access models with current public models offline", async () => {
    const { context, writes } = createContext({
      allowNetwork: false,
      stored: { models: [storedModel(earlyAccessModel)], checkedAt: 1 },
    });

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      })) ?? [];

    expect(models.some((model) => model.id === earlyAccessModel.id)).toBe(true);
    expect(models.length).toBeGreaterThan(1);
    expect(writes).toHaveLength(0);
  });

  it("persists the complete refreshed catalog", async () => {
    const { context, writes } = createContext();

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => [earlyAccessModel],
      })) ?? [];

    expect(writes).toHaveLength(1);
    expect(writes[0]?.models).toHaveLength(models.length);
    expect(
      writes[0]?.models.some((model) => model.id === earlyAccessModel.id),
    ).toBe(true);
    expect(
      writes[0]?.models.some((model) => model.id !== earlyAccessModel.id),
    ).toBe(true);
  });

  it("purges early-access models when discovery is disabled", async () => {
    const { context, writes } = createContext({
      stored: { models: [storedModel(earlyAccessModel)], checkedAt: 1 },
    });

    const models =
      (await refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: false,
      })) ?? [];

    expect(models.some((model) => model.id === earlyAccessModel.id)).toBe(
      false,
    );
    expect(writes[0]?.models).toHaveLength(models.length);
    expect(
      writes[0]?.models.some((model) => model.id === earlyAccessModel.id),
    ).toBe(false);
  });

  it("preserves the stale cache when a network refresh fails", async () => {
    const stored = { models: [storedModel(earlyAccessModel)], checkedAt: 1 };
    const { context, writes } = createContext({ stored });

    // A failed discovery resolves undefined instead of throwing; no
    // persistence happens and the stale store entry is preserved.
    await expect(
      refreshNeuralwattModels(context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(writes).toHaveLength(0);

    const offline = createContext({ allowNetwork: false, stored });
    const offlineModels =
      (await refreshNeuralwattModels(offline.context, {
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      })) ?? [];
    expect(
      offlineModels.some((model) => model.id === earlyAccessModel.id),
    ).toBe(true);
  });
});
