import type {
  ModelsStoreEntry,
  ProviderAuthInteraction,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { NeuralwattApiModel } from "../../src/types/models-api";
import type { NeuralwattModel } from "./models/catalog";
import type { FetchNeuralwattApiModels } from "./models/refresh";
import {
  createNeuralwattProvider,
  NEURALWATT_API_KEY_ENV,
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
} from "./provider";

const staticModel: NeuralwattModel = {
  id: "nw/static",
  name: "nw/static",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const fetchedApiModel = {
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
} as NeuralwattApiModel;

function createProvider(options?: {
  fetchApiModels?: FetchNeuralwattApiModels;
}) {
  const fetchApiModels = vi.fn<FetchNeuralwattApiModels>(
    options?.fetchApiModels ?? (async () => [fetchedApiModel]),
  );
  const provider = createNeuralwattProvider([staticModel], fetchApiModels);
  return { provider, fetchApiModels };
}

function createContext(
  options: {
    allowNetwork?: boolean;
    credential?: { type: "api_key"; key: string };
    stored?: ModelsStoreEntry;
    signal?: AbortSignal;
  } = {},
): RefreshModelsContext {
  return {
    credential: options.credential,
    allowNetwork: options.allowNetwork ?? true,
    force: false,
    signal: options.signal ?? new AbortController().signal,
    stored: options.stored,
    publish: async (publication) => {
      publication.update?.();
      return true;
    },
  };
}

function authCtx(env: Record<string, string | undefined> = {}) {
  return {
    env: async (name: string) => env[name],
    fileExists: async () => false,
  };
}

describe("createNeuralwattProvider", () => {
  it("registers full pi-ai models stamped with api/provider/baseUrl/headers", () => {
    const { provider } = createProvider();
    expect(provider.id).toBe(NEURALWATT_PROVIDER_ID);
    expect(provider.baseUrl).toBe(NEURALWATT_BASE_URL);
    const models = provider.getModels();
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.api).toBe("openai-completions");
      expect(model.provider).toBe(NEURALWATT_PROVIDER_ID);
      expect(model.baseUrl).toBe(NEURALWATT_BASE_URL);
      expect(model.headers).toEqual({
        Referer: "https://pi.dev",
        "X-Title": "npm:@aliou/pi-neuralwatt",
      });
    }
  });
});

describe("auth.apiKey.resolve", () => {
  it("prefers the stored credential", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx({ [NEURALWATT_API_KEY_ENV]: "env-key" }),
      credential: { type: "api_key", key: "stored-key" },
      signal: new AbortController().signal,
    });
    expect(result?.auth.apiKey).toBe("stored-key");
    expect(result?.source).toBe("stored credential");
  });

  it("falls back to the NEURALWATT_API_KEY environment variable", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx({ [NEURALWATT_API_KEY_ENV]: "env-key" }),
      signal: new AbortController().signal,
    });
    expect(result?.auth.apiKey).toBe("env-key");
    expect(result?.source).toBe(NEURALWATT_API_KEY_ENV);
  });

  it("never fails: resolves anonymously so catalog refresh works without credentials", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx(),
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ auth: { apiKey: "" }, source: "anonymous" });
  });

  it("honors the abort signal", async () => {
    const { provider } = createProvider();
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.auth.apiKey?.resolve({
        ctx: authCtx(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("auth.apiKey.check", () => {
  it("reports anonymous availability without a key so models show up in /model", async () => {
    const { provider } = createProvider();
    const result = await provider.auth.apiKey?.check?.({
      ctx: authCtx(),
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({ type: "api_key", source: "anonymous" });
  });

  it("reports configured with an env key or stored credential", async () => {
    const { provider } = createProvider();
    await expect(
      provider.auth.apiKey?.check?.({
        ctx: authCtx({ [NEURALWATT_API_KEY_ENV]: "env-key" }),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ source: NEURALWATT_API_KEY_ENV });
    await expect(
      provider.auth.apiKey?.check?.({
        ctx: authCtx(),
        credential: { type: "api_key", key: "stored-key" },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ source: "stored credential" });
  });
});

describe("auth.apiKey.login", () => {
  it("prompts for the key", async () => {
    const { provider } = createProvider();
    const prompt = vi.fn(async () => "entered-key");
    const credential = await provider.auth.apiKey?.login?.({
      prompt,
      signal: new AbortController().signal,
    } as unknown as ProviderAuthInteraction);
    expect(prompt).toHaveBeenCalledWith({
      type: "secret",
      message: "Enter Neuralwatt API key",
    });
    expect(credential).toEqual({ type: "api_key", key: "entered-key" });
  });
});

describe("refreshModels", () => {
  it("publishes refreshed models from the API", async () => {
    const { provider, fetchApiModels } = createProvider();

    await provider.refreshModels?.(
      createContext({
        credential: { type: "api_key", key: "real-key" },
      }),
    );

    expect(fetchApiModels).toHaveBeenCalled();
    const ids = provider.getModels().map((model) => model.id);
    expect(ids).toContain("nw/fetched");
    expect(provider.getModels()[0]?.provider).toBe(NEURALWATT_PROVIDER_ID);
  });

  it("keeps the static catalog when the fetch fails", async () => {
    const { provider } = createProvider({
      fetchApiModels: async () => {
        throw new Error("network error");
      },
    });

    await provider.refreshModels?.(
      createContext({
        credential: { type: "api_key", key: "real-key" },
      }),
    );

    expect(provider.getModels().map((model) => model.id)).toEqual([
      "nw/static",
    ]);
  });

  it("refreshes anonymously without a key", async () => {
    const fetchApiModels = vi.fn(async () => [fetchedApiModel]);
    const { provider } = createProvider({ fetchApiModels });

    await provider.refreshModels?.(createContext());

    expect(fetchApiModels).toHaveBeenCalled();
    const ids = provider.getModels().map((model) => model.id);
    expect(ids).toContain("nw/fetched");
  });

  it("adopts a fresh stored catalog without fetching", async () => {
    const fetchApiModels = vi.fn(async () => [fetchedApiModel]);
    const { provider } = createProvider({ fetchApiModels });

    const storedModel: ProviderModelConfig = {
      ...staticModel,
      id: "nw/stored",
    };

    await provider.refreshModels?.(
      createContext({
        allowNetwork: true,
        stored: {
          models: [
            {
              ...storedModel,
              provider: NEURALWATT_PROVIDER_ID,
              api: "openai-completions" as const,
              baseUrl: NEURALWATT_BASE_URL,
            },
          ],
          checkedAt: Date.now(),
        },
      }),
    );

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(provider.getModels().map((model) => model.id)).toContain(
      "nw/stored",
    );
  });

  it("restores a stored catalog in offline phases without fetching", async () => {
    const fetchApiModels = vi.fn(async () => [fetchedApiModel]);
    const { provider } = createProvider({ fetchApiModels });

    const storedModel: ProviderModelConfig = {
      ...staticModel,
      id: "nw/stored",
    };

    await provider.refreshModels?.(
      createContext({
        allowNetwork: false,
        stored: {
          models: [
            {
              ...storedModel,
              provider: NEURALWATT_PROVIDER_ID,
              api: "openai-completions" as const,
              baseUrl: NEURALWATT_BASE_URL,
            },
          ],
          checkedAt: Date.now(),
        },
      }),
    );

    expect(fetchApiModels).not.toHaveBeenCalled();
    expect(provider.getModels().map((model) => model.id)).toContain(
      "nw/stored",
    );
  });
});
