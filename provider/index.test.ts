import type { ModelsStoreEntry } from "@earendil-works/pi-ai";
import { createModels, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEURALWATT_BASE_URL, NEURALWATT_PROVIDER_ID } from "../src/constants";
import type { NeuralwattApiModel } from "../src/types/models-api";
import createNeuralwattProvider from "./index";

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

function okModelsFetch(models: NeuralwattApiModel[]) {
  return vi.fn(async () =>
    Response.json(
      { data: models },
      { headers: { "content-type": "application/json" } },
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectCompiledModel(raw: unknown): void {
  const model = raw as Record<string, unknown>;
  expect(model.id).toEqual(expect.any(String));
  expect(model.name).toEqual(expect.any(String));
  expect(model.api).toEqual(expect.any(String));
  expect(model.provider).toBe(NEURALWATT_PROVIDER_ID);
  expect(model.baseUrl).toEqual(expect.any(String));
  expect(model.reasoning).toEqual(expect.any(Boolean));
  expect(model.input).toEqual(expect.any(Array));
  expect(model.cost).toEqual(expect.any(Object));
  expect(model.contextWindow).toEqual(expect.any(Number));
  expect(model.maxTokens).toEqual(expect.any(Number));
}

describe("baseline catalog", () => {
  it("lists models with no credentials and no configuration", () => {
    const provider = createNeuralwattProvider();
    expect(provider.id).toBe(NEURALWATT_PROVIDER_ID);
    expect(provider.baseUrl).toBe(NEURALWATT_BASE_URL);
    expect(provider.getModels().length).toBeGreaterThan(0);
    expect(provider.getAllModels?.().length).toBeGreaterThan(0);
  });

  it("gives every model its required fields", () => {
    const provider = createNeuralwattProvider();
    const all = provider.getAllModels?.() ?? [];
    expect(provider.getModels().length).toBeGreaterThan(0);
    expect(all.length).toBe(provider.getModels().length);
    const ids = new Set(all.map((model) => model.id));
    expect(ids.size).toBe(all.length);
    for (const model of all) expectCompiledModel(model);
  });

  it("falls back to the default base URL for unusable options", () => {
    for (const baseUrl of ["not a url", "ftp://example.com", "  "]) {
      expect(createNeuralwattProvider({ baseUrl }).baseUrl).toBe(
        NEURALWATT_BASE_URL,
      );
    }
  });
});

describe("catalog refresh", () => {
  it("persists the fetched catalog and serves it offline after reopen", async () => {
    const fetchModels = okModelsFetch([fetchedApiModel]);
    vi.stubGlobal("fetch", fetchModels);

    const store = new InMemoryModelsStore();
    const first = createModels({ modelsStore: store });
    const firstProvider = createNeuralwattProvider();
    first.setProvider(firstProvider);
    await first.refresh();
    expect(fetchModels).toHaveBeenCalledTimes(1);
    const refreshed = firstProvider.getModels();
    expect(refreshed.some((model) => model.id === "nw/fetched")).toBe(true);
    const stored = await store.read(NEURALWATT_PROVIDER_ID);
    expect(stored).toBeDefined();

    const second = createModels({ modelsStore: store });
    const secondProvider = createNeuralwattProvider();
    second.setProvider(secondProvider);
    await second.refresh({ allowNetwork: false });
    expect(fetchModels).toHaveBeenCalledTimes(1);
    const offline = secondProvider.getModels();
    expect(offline.some((model) => model.id === "nw/fetched")).toBe(true);
    for (const model of offline) expectCompiledModel(model);
  });

  it("keeps the baseline when the models API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const models = createModels({ modelsStore: new InMemoryModelsStore() });
    const provider = createNeuralwattProvider();
    models.setProvider(provider);
    await models.refresh();
    expect(
      provider.getModels().some((model) => model.id === "nw/fetched"),
    ).toBe(false);
    expect(provider.getModels().length).toBeGreaterThan(0);
  });

  it("lists only the baseline on an offline first refresh", async () => {
    const models = createModels({ modelsStore: new InMemoryModelsStore() });
    const provider = createNeuralwattProvider();
    models.setProvider(provider);
    await models.refresh({ allowNetwork: false });
    expect(
      provider.getModels().some((model) => model.id === "nw/fetched"),
    ).toBe(false);
    expect(provider.getModels().length).toBeGreaterThan(0);
  });
});

describe("models store entry shape", () => {
  it("persists checkedAt so the entry reads as fresh", async () => {
    vi.stubGlobal("fetch", okModelsFetch([fetchedApiModel]));
    const store = new InMemoryModelsStore();
    const models = createModels({ modelsStore: store });
    const provider = createNeuralwattProvider();
    models.setProvider(provider);
    await models.refresh();
    const entry: ModelsStoreEntry | undefined = await store.read(
      NEURALWATT_PROVIDER_ID,
    );
    expect(entry?.checkedAt).toEqual(expect.any(Number));
    expect(entry?.models.some((model) => model.id === "nw/fetched")).toBe(true);
  });
});

describe("request provenance", () => {
  it.each([
    { provenance: undefined, referer: "https://pi.dev" },
    {
      provenance: { referer: "https://app.example" },
      referer: "https://app.example",
    },
    { provenance: { enabled: false }, referer: null },
  ])("sends the selected Referer: $referer", async ({
    provenance,
    referer,
  }) => {
    let headers: Headers | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        headers = new Headers(init?.headers);
        return new Response(
          'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}\n\n' +
            'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
            "data: [DONE]\n\n",
          { headers: { "content-type": "text/event-stream" } },
        );
      }),
    );
    const provider = createNeuralwattProvider({ provenance });
    const stream = provider.streamSimple(
      provider.getModels()[0],
      normalizeContext({
        messages: [{ role: "user", content: "ok", timestamp: 0 }],
      }),
      { apiKey: "test-key", sessionId: "test-1" },
    );
    expect((await stream.result()).stopReason).toBe("stop");
    expect(headers?.get("Referer")).toBe(referer);
    expect(headers?.get("X-NW-Conversation-ID")).toBe(
      provenance?.enabled === false ? null : "test-1",
    );
  });
});
