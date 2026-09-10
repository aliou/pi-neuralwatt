import { describe, expect, it } from "vitest";
import { NEURALWATT_MODELS } from "./models";
import {
  buildAnthropicThinkingLevelMap,
  buildThinkingLevelMap,
  FLEX_COST_MULTIPLIER,
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

  it("should mirror reasoning config for flex variants", () => {
    const byId = new Map(NEURALWATT_MODELS.map((m) => [m.id, m]));

    expect(byId.get("glm-5.2-flex")?.thinkingLevelMap).toEqual(
      byId.get("glm-5.2")?.thinkingLevelMap,
    );
    expect(byId.get("glm-5.2-short-flex")?.thinkingLevelMap).toEqual(
      byId.get("glm-5.2-short")?.thinkingLevelMap,
    );
    expect(byId.get("glm-5.2-short-fast-flex")?.reasoning).toBe(
      byId.get("glm-5.2-short-fast")?.reasoning,
    );
    expect(byId.get("kimi-k2.7-code-flex")?.thinkingLevelMap).toEqual(
      byId.get("kimi-k2.7-code")?.thinkingLevelMap,
    );
    expect(byId.get("kimi-k3-flex")?.thinkingLevelMap).toEqual(
      byId.get("kimi-k3")?.thinkingLevelMap,
    );
  });

  it("should price flex variants with the flex multiplier", () => {
    const byId = new Map(NEURALWATT_MODELS.map((m) => [m.id, m]));
    const pairs: [string, string][] = [
      ["glm-5.2-flex", "glm-5.2"],
      ["glm-5.2-short-flex", "glm-5.2-short"],
      ["glm-5.2-short-fast-flex", "glm-5.2-short-fast"],
      ["kimi-k2.7-code-flex", "kimi-k2.7-code"],
      ["deepseek-v4-flash-flex", "deepseek-v4-flash"],
      ["kimi-k3-flex", "kimi-k3"],
    ];

    for (const [flexId, standardId] of pairs) {
      const flex = byId.get(flexId);
      const standard = byId.get(standardId);
      expect(flex, flexId).toBeDefined();
      expect(standard, standardId).toBeDefined();
      if (!flex || !standard) continue;

      for (const field of ["input", "output", "cacheRead"] as const) {
        expect(flex.cost[field], `${flexId}.cost.${field}`).toBeCloseTo(
          standard.cost[field] * FLEX_COST_MULTIPLIER,
          6,
        );
      }
    }
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

  it("should advertise every Kimi K3 variant with the full 1M context window", () => {
    const k3Models = NEURALWATT_MODELS.filter((model) =>
      model.id.startsWith("kimi-k3"),
    );
    expect(k3Models.map((model) => model.id).sort()).toEqual([
      "kimi-k3",
      "kimi-k3-fast",
      "kimi-k3-flex",
    ]);
    for (const model of k3Models) {
      expect(model.contextWindow, `${model.id}.contextWindow`).toBe(1048560);
      expect(model.maxTokens, `${model.id}.maxTokens`).toBe(1048560);
    }
  });

  it("should derive GLM-5.2 reasoning levels from `max`, `high`, `none`", () => {
    // GLM-5.2 natively supports `high` and `max` reasoning efforts. Pi's `max`
    // level (0.80.6) maps to GLM's top tier; `xhigh` is an unsupported hole.
    const glmModels = NEURALWATT_MODELS.filter((m) =>
      m.id.startsWith("glm-5.2"),
    ).filter((m) => m.reasoning);

    expect(glmModels.length).toBeGreaterThan(0);
    for (const model of glmModels) {
      expect(model.thinkingLevelMap).toEqual({
        off: "none",
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: null,
        max: "max",
      });
    }
  });

  it("should expose only the endpoint-advertised reasoning levels", () => {
    // Each family's map is the identity map of its `supported_efforts`:
    // present levels map to their own name, others are `null`, and `off` is
    // `"none"` only when `mandatory` is false and `"none"` is supported.
    expect(
      NEURALWATT_MODELS.find((m) => m.id === "deepseek-v4-flash")
        ?.thinkingLevelMap,
    ).toEqual({
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    });

    expect(
      NEURALWATT_MODELS.find((m) => m.id === "gemma-4-31b")?.thinkingLevelMap,
    ).toEqual({
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: "max",
    });

    expect(
      NEURALWATT_MODELS.find((m) => m.id === "kimi-k3")?.thinkingLevelMap,
    ).toEqual({
      off: "none",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    });

    expect(
      NEURALWATT_MODELS.find((m) => m.id === "qwen3.6-35b")?.thinkingLevelMap,
    ).toEqual({
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: null,
    });
  });

  it("should null out every level for mandatory reasoning with no efforts", () => {
    // Kimi K2.7 Code has mandatory reasoning with `supported_efforts: []`, so
    // no thinking level is selectable and `off` cannot disable reasoning.
    const k27 = NEURALWATT_MODELS.find((m) => m.id === "kimi-k2.7-code");
    expect(k27?.reasoning).toBe(true);
    expect(k27?.thinkingLevelMap).toEqual({
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    });
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

describe("buildAnthropicThinkingLevelMap", () => {
  it("falls back to high-only with off disabled when the reasoning block is missing", () => {
    expect(buildAnthropicThinkingLevelMap(undefined)).toEqual({
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: null,
    });
  });

  it("exposes positive efforts natively and marks off with the 'none' sentinel", () => {
    const map = buildAnthropicThinkingLevelMap({
      supported_efforts: ["max", "high", "low", "none"],
      mandatory: false,
      effort_aliases: { xhigh: "max", medium: "high", minimal: "low" },
    });
    expect(map).toEqual({
      off: "none",
      minimal: "low",
      low: "low",
      medium: "high",
      high: "high",
      xhigh: "max",
      max: "max",
    });
  });

  it("resolves minimal through the 'none' alias (glm-5.2: minimal means off)", () => {
    const map = buildAnthropicThinkingLevelMap({
      supported_efforts: ["max", "high", "none"],
      mandatory: false,
      effort_aliases: {
        xhigh: "max",
        medium: "high",
        low: "high",
        minimal: "none",
      },
    });
    expect(map.minimal).toBe("none");
    expect(map.low).toBe("high");
    expect(map.medium).toBe("high");
    expect(map.xhigh).toBe("max");
  });

  it("forbids off when reasoning is mandatory, even if 'none' is supported", () => {
    const map = buildAnthropicThinkingLevelMap({
      supported_efforts: ["max", "high", "low", "none"],
      mandatory: true,
    });
    expect(map.off).toBeNull();
    expect(map.low).toBe("low");
  });

  it("nulls levels that are neither supported nor aliased", () => {
    const map = buildAnthropicThinkingLevelMap({
      supported_efforts: ["high", "none"],
      mandatory: false,
    });
    expect(map).toEqual({
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: null,
    });
  });

  it("ignores aliases whose target is not natively supported", () => {
    const map = buildAnthropicThinkingLevelMap({
      supported_efforts: ["high"],
      mandatory: false,
      effort_aliases: { minimal: "low" },
    } as NeuralwattReasoningMapSource);
    expect(map.minimal).toBeNull();
  });
});
