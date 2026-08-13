import type {
  ModelsStoreEntry,
  ProviderAuthInteraction,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { RefreshNeuralwattModelsOptions } from "./models/refresh";
import {
  createNeuralwattProvider,
  NEURALWATT_API_KEY_ENV,
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
} from "./provider";

const staticModel: ProviderModelConfig = {
  id: "nw/static",
  name: "nw/static",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const fetchedModel: ProviderModelConfig = {
  ...staticModel,
  id: "nw/fetched",
  name: "nw/fetched",
};

function createProvider(options: {
  refreshOptions: () => RefreshNeuralwattModelsOptions;
}) {
  return createNeuralwattProvider([staticModel], options.refreshOptions);
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
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
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
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx({ [NEURALWATT_API_KEY_ENV]: "env-key" }),
      credential: { type: "api_key", key: "stored-key" },
      signal: new AbortController().signal,
    });
    expect(result?.auth.apiKey).toBe("stored-key");
    expect(result?.source).toBe("stored credential");
  });

  it("falls back to the NEURALWATT_API_KEY environment variable", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx({ [NEURALWATT_API_KEY_ENV]: "env-key" }),
      signal: new AbortController().signal,
    });
    expect(result?.auth.apiKey).toBe("env-key");
    expect(result?.source).toBe(NEURALWATT_API_KEY_ENV);
  });

  it("never fails: resolves anonymously so catalog refresh works without credentials", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
    const result = await provider.auth.apiKey?.resolve({
      ctx: authCtx(),
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ auth: { apiKey: "" }, source: "anonymous" });
  });

  it("honors the abort signal", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
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
  it("reports unconfigured without a key so models stay hidden from /model", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
    const result = await provider.auth.apiKey?.check?.({
      ctx: authCtx(),
      signal: new AbortController().signal,
    });
    expect(result).toBeUndefined();
  });

  it("reports configured with an env key or stored credential", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
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
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
      }),
    });
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
  it("publishes refreshed models from the early-access discovery", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => [fetchedModel],
      }),
    });

    await provider.refreshModels?.(
      createContext({
        credential: { type: "api_key", key: "real-key" },
      }),
    );

    const ids = provider.getModels().map((model) => model.id);
    expect(ids).toContain("nw/fetched");
    expect(provider.getModels()[0]?.provider).toBe(NEURALWATT_PROVIDER_ID);
  });

  it("keeps the static catalog when discovery returns undefined", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => undefined,
      }),
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

  it("keeps the public catalog when no key is available", async () => {
    const loadEarlyAccess = vi.fn(async () => [fetchedModel]);
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess,
      }),
    });

    await provider.refreshModels?.(createContext());

    // Anonymous refresh skips early-access discovery and keeps the public
    // catalog; discovered-only models never appear.
    expect(loadEarlyAccess).not.toHaveBeenCalled();
    const ids = provider.getModels().map((model) => model.id);
    expect(ids).toContain("kimi-k3");
    expect(ids).not.toContain("nw/fetched");
  });

  it("adopts a fresh stored catalog without fetching", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: vi.fn(async () => [fetchedModel]),
      }),
    });

    await provider.refreshModels?.(
      createContext({
        allowNetwork: true,
        stored: {
          models: [
            {
              ...fetchedModel,
              provider: NEURALWATT_PROVIDER_ID,
              api: "openai-completions" as const,
              baseUrl: NEURALWATT_BASE_URL,
            },
          ],
          checkedAt: Date.now(),
        },
      }),
    );

    expect(provider.getModels().map((model) => model.id)).toContain(
      "nw/fetched",
    );
  });

  it("restores a stored catalog in offline phases without fetching", async () => {
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: vi.fn(async () => [fetchedModel]),
      }),
    });

    await provider.refreshModels?.(
      createContext({
        allowNetwork: false,
        stored: {
          models: [
            {
              ...fetchedModel,
              provider: NEURALWATT_PROVIDER_ID,
              api: "openai-completions" as const,
              baseUrl: NEURALWATT_BASE_URL,
            },
          ],
          checkedAt: Date.now(),
        },
      }),
    );

    expect(provider.getModels().map((model) => model.id)).toContain(
      "nw/fetched",
    );
  });

  it("keeps the catalog unchanged when the refresh signal aborts mid-flight", async () => {
    const controller = new AbortController();
    const provider = createProvider({
      refreshOptions: () => ({
        includeLegacyModelIds: false,
        includeAliasedModelIds: false,
        includeEarlyAccessModels: true,
        loadEarlyAccess: async () => {
          controller.abort();
          return [fetchedModel];
        },
      }),
    });

    // The refresh resolves to the cached catalog on abort, so the
    // fetched discovery result is never adopted.
    await provider.refreshModels?.(
      createContext({
        credential: { type: "api_key", key: "real-key" },
        signal: controller.signal,
      }),
    );

    expect(provider.getModels().map((model) => model.id)).not.toContain(
      "nw/fetched",
    );
  });
});
