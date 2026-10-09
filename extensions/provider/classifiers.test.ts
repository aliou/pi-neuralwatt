import type {
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { NeuralwattApiModel } from "../../src/types/models-api";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "./constants";
import {
  buildNeuralwattProviderModelsFromApi,
  isNeuralwattClassifierModel,
  type NeuralwattModel,
  partitionNeuralwattModels,
} from "./models/catalog";
import type { FetchNeuralwattApiModels } from "./models/refresh";
import { createNeuralwattProvider } from "./provider";

const chatApiModel = {
  id: "kimi-k3",
  object: "model",
  created: 0,
  owned_by: "neuralwatt",
  max_model_len: 262_144,
  metadata: {
    display_name: "Kimi K3",
    description: null,
    provider: "Moonshot AI",
    huggingface_id: null,
    pricing: {
      input_per_million: 0.5,
      output_per_million: 2,
      cached_input_per_million: null,
      cached_output_per_million: null,
      currency: "USD",
      pricing_tbd: false,
    },
    capabilities: {
      tools: true,
      json_mode: true,
      vision: false,
      reasoning: false,
      reasoning_effort: false,
      streaming: true,
      system_role: true,
      developer_role: false,
      task: "chat",
    },
    limits: {
      max_context_length: 262_144,
      max_output_tokens: null,
      max_images: null,
    },
    deprecated: false,
    deprecated_message: null,
  },
} as NeuralwattApiModel;

const clefFlashApiModel = {
  id: "clef-flash",
  object: "model",
  created: 0,
  owned_by: "neuralwatt",
  max_model_len: 262_128,
  metadata: {
    display_name: "Clef Flash",
    description:
      "Clef Flash: a 9B decision model from Cloudflare. Send a state (text, JSON, images or video) and typed questions; get a probability for every allowed answer in one pass, with no generated text. 262K context.",
    provider: "Cloudflare",
    huggingface_id: "Cloudflare/clef-flash",
    pricing: {
      input_per_million: 0.18,
      output_per_million: 0.0,
      cached_input_per_million: 0.018,
      cached_output_per_million: null,
      currency: "USD",
      pricing_tbd: false,
      service_tier: "standard",
      flex_discount_multiplier: null,
    },
    capabilities: {
      tools: false,
      json_mode: false,
      vision: true,
      audio_input: false,
      reasoning: false,
      reasoning_effort: false,
      streaming: false,
      system_role: false,
      developer_role: false,
      task: "decision",
      hosted_tools: false,
    },
    reasoning: null,
    limits: {
      max_context_length: 262_128,
      max_output_tokens: 0,
      max_images: null,
    },
    deprecated: false,
    deprecated_message: null,
  },
} as unknown as NeuralwattApiModel;

const embeddingApiModel = {
  id: "qwen3-embedding-8b",
  object: "model",
  created: 0,
  owned_by: "neuralwatt",
  max_model_len: 8176,
  metadata: {
    display_name: "Qwen3 Embedding 8B",
    description: null,
    provider: "Qwen",
    huggingface_id: null,
    pricing: {
      input_per_million: 0.01,
      output_per_million: 0.0,
      cached_input_per_million: 0.001,
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
      task: "embed",
      embedding_dimensions: 4096,
    },
    limits: {
      max_context_length: 8176,
      max_output_tokens: 0,
      max_images: null,
    },
    deprecated: false,
    deprecated_message: null,
  },
} as NeuralwattApiModel;

function createProvider(options?: {
  staticModels?: NeuralwattModel[];
  fetchApiModels?: FetchNeuralwattApiModels;
  api?: "openai-completions" | "anthropic-messages";
}) {
  const staticModels =
    options?.staticModels ??
    buildNeuralwattProviderModelsFromApi([chatApiModel, clefFlashApiModel]);
  const fetchApiModels = vi.fn<FetchNeuralwattApiModels>(
    options?.fetchApiModels ?? (async () => []),
  );
  const provider = createNeuralwattProvider(staticModels, fetchApiModels, {
    api: options?.api,
  });
  return { provider, fetchApiModels };
}

function createContext(): RefreshModelsContext {
  return {
    credential: { type: "api_key", key: "test-key" },
    allowNetwork: true,
    force: false,
    signal: new AbortController().signal,
    publish: async (publication) => {
      publication.update?.();
      return true;
    },
  };
}

describe("buildNeuralwattProviderModelsFromApi (decision models)", () => {
  it("compiles a task: decision entry into a System One classifier model", () => {
    const models = buildNeuralwattProviderModelsFromApi([
      chatApiModel,
      embeddingApiModel,
      clefFlashApiModel,
    ]);

    expect(models.map((m) => m.id)).toEqual(["kimi-k3", "clef-flash"]);

    const classifier = models.find(isNeuralwattClassifierModel);
    expect(classifier).toMatchObject({
      type: "classifier",
      api: "typesafe-system-one",
      id: "clef-flash",
      name: "Clef Flash",
      input: ["text", "image"],
      cost: { input: 0.18, output: 0, cacheRead: 0.018, cacheWrite: 0 },
      contextWindow: 262_128,
    });
    expect(classifier).not.toHaveProperty("reasoning");
    expect(classifier).not.toHaveProperty("maxTokens");
    expect(classifier).not.toHaveProperty("compat");
  });

  it("keeps anonymous (chat-only) catalogs free of classifiers", () => {
    const models = buildNeuralwattProviderModelsFromApi([
      chatApiModel,
      embeddingApiModel,
    ]);

    expect(models.map((m) => m.id)).toEqual(["kimi-k3"]);
    expect(models.filter(isNeuralwattClassifierModel)).toEqual([]);
    expect(partitionNeuralwattModels(models).classifiers).toEqual([]);
  });
});

describe("provider classifier registration", () => {
  for (const api of ["openai-completions", "anthropic-messages"] as const) {
    describe(`on ${api}`, () => {
      it("exposes classifiers in getAllModels() but never in getModels()", () => {
        const { provider } = createProvider({ api });

        const chatOnly = provider.getModels();
        expect(chatOnly.map((m) => m.id)).toEqual(["kimi-k3"]);
        expect(
          chatOnly.every((m) => (m as { type?: string }).type !== "classifier"),
        ).toBe(true);
        expect(chatOnly.every((m) => m.api === api)).toBe(true);

        const all = provider.getAllModels?.() ?? [];
        expect(all.map((m) => m.id)).toEqual(["kimi-k3", "clef-flash"]);

        const classifier = all.find((m) => m.type === "classifier");
        expect(classifier).toMatchObject({
          type: "classifier",
          api: "typesafe-system-one",
          id: "clef-flash",
          provider: NEURALWATT_PROVIDER_ID,
          baseUrl: NEURALWATT_BASE_URL,
          headers: NEURALWATT_REQUEST_HEADERS,
        });
      });

      it("registers a classify implementation", () => {
        const { provider } = createProvider({ api });
        expect(typeof provider.classify).toBe("function");
      });
    });
  }

  it("publishes classifiers from a keyed catalog refresh", async () => {
    const fetchApiModels = vi.fn<FetchNeuralwattApiModels>(async () => [
      chatApiModel,
      clefFlashApiModel,
    ]);
    const { provider } = createProvider({
      staticModels: buildNeuralwattProviderModelsFromApi([chatApiModel]),
      fetchApiModels,
    });

    expect(provider.getAllModels?.().map((m) => m.id)).toEqual(["kimi-k3"]);

    await provider.refreshModels?.(createContext());

    expect(fetchApiModels).toHaveBeenCalled();
    expect(provider.getModels().map((m) => m.id)).toEqual(["kimi-k3"]);
    expect(provider.getAllModels?.().map((m) => m.id)).toEqual([
      "kimi-k3",
      "clef-flash",
    ]);
  });

  it("keeps models() chat-only when the store persists classifier entries", async () => {
    const storedClassifier = {
      type: "classifier",
      api: "typesafe-system-one",
      id: "clef-flash",
      name: "Clef Flash",
      provider: NEURALWATT_PROVIDER_ID,
      baseUrl: NEURALWATT_BASE_URL,
      input: ["text", "image"],
      cost: { input: 0.18, output: 0, cacheRead: 0.018, cacheWrite: 0 },
      contextWindow: 262_128,
    };
    const storedChat = {
      id: "kimi-k3",
      name: "Kimi K3",
      reasoning: false,
      provider: NEURALWATT_PROVIDER_ID,
      api: "openai-completions",
      baseUrl: NEURALWATT_BASE_URL,
      input: ["text"],
      cost: { input: 0.5, output: 2, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 262_144,
      maxTokens: 262_144,
    };
    const stored: ModelsStoreEntry & { catalogKey?: string } = {
      models: [storedChat as never, storedClassifier as never],
      checkedAt: Date.now(),
      catalogKey: `key v2 ${NEURALWATT_BASE_URL}`,
    };
    const { provider, fetchApiModels } = createProvider({
      fetchApiModels: async () => {
        throw new Error("must not fetch: fresh stored catalog wins");
      },
    });

    const context = createContext();
    context.stored = stored;
    await provider.refreshModels?.(context);

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(provider.getModels().map((m) => m.id)).toEqual(["kimi-k3"]);
    expect(provider.getAllModels?.().map((m) => m.id)).toEqual([
      "kimi-k3",
      "clef-flash",
    ]);
  });
});
