import type {
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { NeuralwattApiModel } from "../../../src/types/models-api";
import {
  buildNeuralwattProviderModelsFromApi,
  buildNeuralwattProviderModelsFromStore,
  type NeuralwattModel,
} from "./catalog";
import { createNeuralwattRefreshModels, MODEL_STORE_TTL_MS } from "./refresh";

const staticModel: NeuralwattModel = {
  id: "nw/static",
  name: "nw/static",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const apiModel: NeuralwattApiModel = {
  id: "nw/fetched",
  object: "model",
  created: 0,
  owned_by: "neuralwatt",
  max_model_len: 128_000,
  metadata: {
    display_name: "nw/fetched",
    description: null,
    provider: "test",
    huggingface_id: null,
    pricing: {
      input_per_million: 1,
      output_per_million: 2,
      cached_input_per_million: 0,
      cached_output_per_million: null,
      currency: "USD",
      pricing_tbd: false,
    },
    capabilities: {
      tools: false,
      json_mode: false,
      vision: false,
      reasoning: false,
      reasoning_effort: false,
      streaming: true,
      system_role: true,
      developer_role: false,
    },
    limits: {
      max_context_length: 128_000,
      max_output_tokens: 16_384,
      max_images: null,
    },
    deprecated: false,
    deprecated_message: null,
  },
};

function createContext(options?: {
  allowNetwork?: boolean;
  credential?: { type: "api_key"; key: string };
  stored?: ModelsStoreEntry;
  force?: boolean;
  signal?: AbortSignal;
}): RefreshModelsContext {
  return {
    credential: options?.credential,
    allowNetwork: options?.allowNetwork ?? true,
    force: options?.force,
    signal: options?.signal ?? new AbortController().signal,
    stored: options?.stored,
    publish: async (publication) => {
      publication.update?.();
      return true;
    },
  };
}

function createRefresh(options?: {
  fetchApiModels?: (
    apiKey: string | undefined,
    signal?: AbortSignal,
  ) => Promise<readonly NeuralwattApiModel[]>;
}) {
  const fetchApiModels =
    options?.fetchApiModels ??
    (async () => [apiModel] as readonly NeuralwattApiModel[]);

  return createNeuralwattRefreshModels(
    [staticModel],
    fetchApiModels,
    buildNeuralwattProviderModelsFromApi,
    buildNeuralwattProviderModelsFromStore,
  );
}

describe("createNeuralwattRefreshModels", () => {
  it("fetches and persists the API catalog on refresh", async () => {
    const writes: ModelsStoreEntry[] = [];
    const refresh = createRefresh();
    const context: RefreshModelsContext = {
      ...createContext({
        credential: { type: "api_key", key: "real-key" },
      }),
      publish: async (publication) => {
        if (publication.persist) writes.push(publication.persist);
        publication.update?.();
        return true;
      },
    };

    const models = await refresh(context);

    expect(models.some((m) => m.id === "nw/fetched")).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.models).toHaveLength(1);
    expect(writes[0]?.checkedAt).toBeGreaterThan(0);
  });

  it("returns the static fallback when the fetch fails", async () => {
    const refresh = createRefresh({
      fetchApiModels: async () => {
        throw new Error("network error");
      },
    });

    const models = await refresh(
      createContext({
        credential: { type: "api_key", key: "real-key" },
      }),
    );

    expect(models.map((m) => m.id)).toEqual(["nw/static"]);
  });

  it("builds an empty catalog when the API returns no models", async () => {
    const refresh = createRefresh({
      fetchApiModels: async () => [],
    });

    const models = await refresh(
      createContext({
        credential: { type: "api_key", key: "real-key" },
      }),
    );

    // Empty API result → empty catalog (all models removed).
    expect(models).toHaveLength(0);
  });

  it("refreshes anonymously without a key", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    // No credential — anonymous. The refresh should still fetch because the
    // public /v1/models endpoint serves the public catalog without auth.
    const models = await refresh(createContext());

    expect(fetchApiModels).toHaveBeenCalledWith(
      undefined,
      expect.any(AbortSignal),
    );
    expect(models.some((m) => m.id === "nw/fetched")).toBe(true);
  });

  it("refreshes with a placeholder key ('-')", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    const models = await refresh(
      createContext({
        credential: { type: "api_key", key: "-" },
      }),
    );

    // The placeholder key is passed through; the fetch function (in the real
    // provider) skips it via authHeaders. The refresh itself doesn't gate on
    // the key.
    expect(fetchApiModels).toHaveBeenCalledWith("-", expect.any(AbortSignal));
    expect(models.some((m) => m.id === "nw/fetched")).toBe(true);
  });

  it("returns the stored catalog when it is fresh (within TTL)", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    const storedModel: ProviderModelConfig = {
      ...staticModel,
      id: "nw/stored",
    };

    const models = await refresh(
      createContext({
        stored: {
          models: [
            {
              ...storedModel,
              provider: "neuralwatt",
              api: "openai-completions" as const,
              baseUrl: "https://api.neuralwatt.com/v1",
            },
          ],
          checkedAt: Date.now(),
        },
      }),
    );

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(models.some((m) => m.id === "nw/stored")).toBe(true);
  });

  it("refetches when the store is stale (beyond TTL)", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    await refresh(
      createContext({
        stored: {
          models: [],
          checkedAt: Date.now() - MODEL_STORE_TTL_MS - 1,
        },
      }),
    );

    expect(fetchApiModels).toHaveBeenCalled();
  });

  it("refetches when force is true even with a fresh store", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    await refresh(
      createContext({
        force: true,
        stored: {
          models: [],
          checkedAt: Date.now(),
        },
      }),
    );

    expect(fetchApiModels).toHaveBeenCalled();
  });

  it("returns the stored catalog when network is not allowed", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    const storedModel: ProviderModelConfig = {
      ...staticModel,
      id: "nw/stored",
    };

    const models = await refresh(
      createContext({
        allowNetwork: false,
        stored: {
          models: [
            {
              ...storedModel,
              provider: "neuralwatt",
              api: "openai-completions" as const,
              baseUrl: "https://api.neuralwatt.com/v1",
            },
          ],
          checkedAt: 1,
        },
      }),
    );

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(models.some((m) => m.id === "nw/stored")).toBe(true);
  });

  it("returns the static fallback when offline and no store", async () => {
    const fetchApiModels = vi.fn(async () => [apiModel]);
    const refresh = createRefresh({ fetchApiModels });

    const models = await refresh(createContext({ allowNetwork: false }));

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(models.map((m) => m.id)).toEqual(["nw/static"]);
  });

  it("rethrows on abort", async () => {
    const controller = new AbortController();
    const refresh = createRefresh({
      fetchApiModels: async () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    });

    await expect(
      refresh(
        createContext({
          credential: { type: "api_key", key: "real-key" },
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow();
  });
});
