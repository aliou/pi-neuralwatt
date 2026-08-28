import { describe, expect, it } from "vitest";
import { NEURALWATT_MODELS } from "./models";
import {
  buildThinkingLevelMap,
  FLEX_COST_MULTIPLIER,
  type NeuralwattReasoningMapSource,
} from "./models/build";

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

  it("should cap every Kimi K3 variant at the 327,680 serving limit", () => {
    const k3Models = NEURALWATT_MODELS.filter((model) =>
      model.id.startsWith("kimi-k3"),
    );
    expect(k3Models.map((model) => model.id).sort()).toEqual([
      "kimi-k3",
      "kimi-k3-fast",
      "kimi-k3-flex",
    ]);
    for (const model of k3Models) {
      expect(model.contextWindow, `${model.id}.contextWindow`).toBe(327680);
      expect(model.maxTokens, `${model.id}.maxTokens`).toBe(327680);
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
