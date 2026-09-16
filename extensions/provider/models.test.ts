import { describe, expect, it } from "vitest";
import { NEURALWATT_MODELS } from "./models";
import {
  buildThinkingLevelMap,
  type NeuralwattReasoningMapSource,
  resolveMaxTokens,
} from "./models/build";
import { buildNeuralwattProviderModelsFromApi } from "./models/catalog";

describe("Neuralwatt models", () => {
  it("should never allow more output tokens than context", () => {
    for (const model of NEURALWATT_MODELS) {
      expect(model.maxTokens, model.id).toBeGreaterThan(0);
      expect(model.maxTokens, model.id).toBeLessThanOrEqual(
        model.contextWindow,
      );
    }
  });

  it("should have unique model IDs", () => {
    const ids = NEURALWATT_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have required fields for every model", () => {
    for (const model of NEURALWATT_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(typeof model.reasoning).toBe("boolean");
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(model.cost.input).toBeGreaterThanOrEqual(0);
      expect(model.cost.output).toBeGreaterThan(0);
      expect(model.input).toContain("text");
      if (model.compat) {
        if ("supportsDeveloperRole" in model.compat) {
          expect(model.compat.supportsDeveloperRole).toBe(false);
        }
        if ("maxTokensField" in model.compat) {
          expect(model.compat.maxTokensField).toBe("max_tokens");
        }
      }
    }
  });

  it("should have a complete thinkingLevelMap for reasoning models", () => {
    const reasoningModels = NEURALWATT_MODELS.filter((m) => m.reasoning);
    const allLevels = [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ] as const;

    for (const model of reasoningModels) {
      expect(model.thinkingLevelMap, model.id).toBeDefined();
      // Every key must be explicit: Pi treats absence (undefined) as enabled
      // for non-xhigh/max levels, so a derived map must never leave holes.
      for (const level of allLevels) {
        expect(model.thinkingLevelMap, `${model.id}.${level}`).toHaveProperty(
          level,
        );
      }
    }
  });
});

describe("buildNeuralwattProviderModelsFromApi", () => {
  it("should exclude embeddings models and never emit maxTokens: 0", () => {
    // Fixture: API-shaped payload with an embeddings model and a chat model
    const apiModels = [
      {
        id: "qwen3-embedding-8b",
        object: "model",
        created: 1234567890,
        owned_by: "neuralwatt",
        max_model_len: 8176,
        metadata: {
          display_name: "Qwen3 Embedding 8B",
          description: null,
          provider: "neuralwatt",
          huggingface_id: "Qwen/Qwen3-Embedding-8B",
          pricing: {
            input_per_million: 10,
            output_per_million: 0,
            cached_input_per_million: 1,
            cached_output_per_million: null,
            currency: "USD",
            pricing_tbd: false,
            service_tier: "standard",
            flex_discount_multiplier: null,
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
      },
      {
        id: "chat-model-7b",
        object: "model",
        created: 1234567890,
        owned_by: "neuralwatt",
        max_model_len: 4096,
        metadata: {
          display_name: "Chat Model 7B",
          description: null,
          provider: "neuralwatt",
          huggingface_id: null,
          pricing: {
            input_per_million: 5,
            output_per_million: 10,
            cached_input_per_million: 1,
            cached_output_per_million: null,
            currency: "USD",
            pricing_tbd: false,
            service_tier: "standard",
            flex_discount_multiplier: null,
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
            max_context_length: 4096,
            max_output_tokens: 1024,
            max_images: null,
          },
          deprecated: false,
          deprecated_message: null,
        },
      },
    ];

    // Build models from API
    const models = buildNeuralwattProviderModelsFromApi(apiModels);

    // Assert embeddings model is excluded (no entries with id containing "embedding")
    const embeddingModels = models.filter((m) => m.id.includes("embedding"));
    expect(embeddingModels.length).toBe(0);

    // Assert chat model is present
    const chatModels = models.filter((m) => m.id === "chat-model-7b");
    expect(chatModels.length).toBe(1);
    const chatModel = chatModels[0];

    // Assert chat model has valid maxTokens (> 0)
    expect(chatModel.maxTokens).toBeGreaterThan(0);
    expect(chatModel.maxTokens).toBeLessThanOrEqual(chatModel.contextWindow);

    // Assert chat model has valid cost.output (> 0)
    expect(chatModel.cost.output).toBeGreaterThan(0);

    // Assert resolveMaxTokens treats 0 as null (fallback to contextWindow)
    expect(resolveMaxTokens(0, 4096)).toBe(4096);
    expect(resolveMaxTokens(null, 4096)).toBe(4096);
    expect(resolveMaxTokens(1024, 4096)).toBe(1024);
  });

  it("takes flex pricing directly (already discounted in API metadata)", () => {
    const models = buildNeuralwattProviderModelsFromApi([
      {
        id: "chat-model-7b-flex",
        object: "model",
        created: 1234567890,
        owned_by: "neuralwatt",
        max_model_len: 4096,
        metadata: {
          display_name: "Chat Model 7B (flex)",
          description: null,
          provider: "neuralwatt",
          huggingface_id: null,
          pricing: {
            // Already-discounted flex prices; the multiplier field is
            // provenance only and must not be applied again.
            input_per_million: 3.25,
            output_per_million: 6.5,
            cached_input_per_million: 0.65,
            cached_output_per_million: null,
            currency: "USD",
            pricing_tbd: false,
            service_tier: "flex",
            flex_discount_multiplier: 0.65,
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
            max_context_length: 4096,
            max_output_tokens: 1024,
            max_images: null,
          },
          deprecated: false,
          deprecated_message: null,
        },
      },
    ]);

    const flexModel = models.find((m) => m.id === "chat-model-7b-flex");
    expect(flexModel).toBeDefined();
    expect(flexModel?.cost.input).toBe(3.25);
    expect(flexModel?.cost.output).toBe(6.5);
    expect(flexModel?.cost.cacheRead).toBe(0.65);
  });
});

describe("buildThinkingLevelMap", () => {
  const all = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ] as const;

  it("enables every supported effort by identity and nulls the rest", () => {
    const map = buildThinkingLevelMap({
      supported_efforts: ["max", "high", "none"],
      mandatory: false,
    });
    expect(map).toEqual({
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    });
  });

  it("maps `off` to `none` only when not mandatory", () => {
    const notMandatory: NeuralwattReasoningMapSource = {
      supported_efforts: ["high", "none"],
      mandatory: false,
    };
    expect(buildThinkingLevelMap(notMandatory).off).toBe("none");

    const mandatory: NeuralwattReasoningMapSource = {
      supported_efforts: ["high", "none"],
      mandatory: true,
    };
    expect(buildThinkingLevelMap(mandatory).off).toBeNull();
  });

  it("disables every level when supported_efforts is empty", () => {
    const map = buildThinkingLevelMap({
      supported_efforts: [],
      mandatory: false,
    } as NeuralwattReasoningMapSource);
    for (const level of all) {
      expect(map[level === "none" ? "off" : level]).toBeNull();
    }
  });

  it("falls back to high-only with off disabled when the reasoning block is missing", () => {
    const map = buildThinkingLevelMap(undefined);
    expect(map).toEqual({
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: null,
    });
  });
});
