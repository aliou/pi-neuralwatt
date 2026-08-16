import { describe, expect, it } from "vitest";
import {
  ALIAS_MODEL_MAP,
  ALIAS_NEURALWATT_MODEL_IDS,
  EARLY_ACCESS_NEURALWATT_MODELS,
  getNeuralwattModels,
  LEGACY_NEURALWATT_MODEL_IDS,
  NEURALWATT_MODELS,
} from "./models";
import {
  buildThinkingLevelMap,
  FLEX_COST_MULTIPLIER,
  type NeuralwattReasoningMapSource,
} from "./models/build";

const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

interface ApiModelReasoning {
  default_enabled: boolean;
  mandatory: boolean;
  supported_efforts: ReasoningEffort[];
  accepted_efforts?: ReasoningEffort[];
  default_effort: ReasoningEffort;
  effort_aliases?: Partial<Record<ReasoningEffort, ReasoningEffort>>;
}

interface ApiModelMetadata {
  display_name: string;
  description: string | null;
  provider: string;
  huggingface_id: string | null;
  pricing: {
    input_per_million: number;
    output_per_million: number;
    cached_input_per_million: number | null;
    cached_output_per_million: number | null;
    currency: string;
    pricing_tbd: boolean;
  };
  capabilities: {
    tools: boolean;
    json_mode: boolean;
    vision: boolean;
    reasoning: boolean;
    reasoning_effort: boolean;
    streaming: boolean;
    system_role: boolean;
    developer_role: boolean;
  };
  reasoning?: ApiModelReasoning;
  limits: {
    max_context_length: number;
    max_output_tokens: number | null;
    max_images: number | null;
  };
  deprecated: boolean;
  deprecated_message: string | null;
}

interface ApiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  root?: string;
  parent?: string | null;
  max_model_len: number;
  metadata?: ApiModelMetadata;
}

interface ApiResponse {
  object: "list";
  data: ApiModel[];
}

interface Discrepancy {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

function isFlexModelId(id: string): boolean {
  return id.endsWith("-flex");
}

/**
 * Models whose real serving limit is known to be lower than the advertised
 * `max_model_len`. The Kimi K3 endpoints reject anything above 327,680 total
 * tokens (`400: … maximum context length of 327680`), despite the API
 * advertising 1,048,560 with a null output cap for the whole family. The
 * catalog pins the enforced limit, so the drift check skips the advertised
 * context-window comparison for these IDs. Remove an entry once the API
 * metadata agrees with the serving limit again.
 */
const CONTEXT_WINDOW_OVERRIDES: ReadonlyMap<string, number> = new Map([
  ["kimi-k3", 327680],
  ["kimi-k3-fast", 327680],
  ["kimi-k3-flex", 327680],
]);

/**
 * Returns undefined only when the network is unavailable, so offline runs skip.
 * An HTTP error is a real contract failure and still fails the test.
 */
async function fetchApiModels(): Promise<ApiModel[] | undefined> {
  let response: Response;
  try {
    response = await fetch("https://api.neuralwatt.com/v1/models", {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Referer: "https://github.com/aliou/pi-neuralwatt",
        "X-Title": "npm:@aliou/pi-neuralwatt",
      },
    });
  } catch {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: ApiResponse = await response.json();
  // Filter out deprecated and pricing_tbd models, same as the live provider did
  return data.data.filter(
    (m) => !m.metadata?.deprecated && !m.metadata?.pricing.pricing_tbd,
  );
}

function compareModels(
  apiModels: ApiModel[],
  hardcodedModels: typeof NEURALWATT_MODELS,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];
  const epsilon = 0.001;

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      if (
        !LEGACY_NEURALWATT_MODEL_IDS.has(hardcoded.id) &&
        !isFlexModelId(hardcoded.id)
      ) {
        discrepancies.push({
          model: hardcoded.id,
          field: "exists",
          hardcoded: true,
          api: false,
        });
      }
      continue;
    }

    const meta = apiModel.metadata;

    // Check context window, honoring known serving-limit overrides
    const contextOverride = CONTEXT_WINDOW_OVERRIDES.get(hardcoded.id);
    if (contextOverride !== undefined) {
      if (apiModel.max_model_len === hardcoded.contextWindow) {
        discrepancies.push({
          model: hardcoded.id,
          field: "contextWindowOverrideStale",
          hardcoded: hardcoded.contextWindow,
          api: apiModel.max_model_len,
        });
      }
    } else if (apiModel.max_model_len !== hardcoded.contextWindow) {
      discrepancies.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.max_model_len,
      });
    }

    // Check reasoning
    if (meta && meta.capabilities.reasoning !== hardcoded.reasoning) {
      discrepancies.push({
        model: hardcoded.id,
        field: "reasoning",
        hardcoded: hardcoded.reasoning,
        api: meta.capabilities.reasoning,
      });
    }

    // Check the reasoning level map against the endpoint's reasoned contract.
    // `buildThinkingLevelMap` is authoritative; the hardcoded snapshot must
    // produce the same map the live `reasoning` block would. Skipped for
    // non-reasoning models (no map) and flex variants (pricing-only).
    if (meta && hardcoded.reasoning && !isFlexModelId(hardcoded.id)) {
      const expected = buildThinkingLevelMap(meta.reasoning);
      const actual = hardcoded.thinkingLevelMap;
      for (const level of [
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ] as const) {
        if (actual?.[level] !== expected[level]) {
          discrepancies.push({
            model: hardcoded.id,
            field: `thinkingLevelMap.${level}`,
            hardcoded: actual?.[level] ?? null,
            api: expected[level],
          });
        }
      }
    }

    // Check vision / input
    if (meta) {
      const hasVision = hardcoded.input.includes("image");
      if (meta.capabilities.vision !== hasVision) {
        discrepancies.push({
          model: hardcoded.id,
          field: "input (vision)",
          hardcoded: hasVision,
          api: meta.capabilities.vision,
        });
      }
    }

    // Check pricing. Flex variants are advertised by the API at standard
    // pricing; the 35% Flex discount is a billing-time concept applied via
    // costMultiplier in our hardcoded definitions, so skip price checks for
    // them.
    if (meta && !isFlexModelId(hardcoded.id)) {
      if (
        Math.abs(meta.pricing.input_per_million - hardcoded.cost.input) >
        epsilon
      ) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.input",
          hardcoded: hardcoded.cost.input,
          api: meta.pricing.input_per_million,
        });
      }
      if (
        Math.abs(meta.pricing.output_per_million - hardcoded.cost.output) >
        epsilon
      ) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.output",
          hardcoded: hardcoded.cost.output,
          api: meta.pricing.output_per_million,
        });
      }
      // Cache read
      const apiCacheRead = meta.pricing.cached_input_per_million ?? 0;
      if (Math.abs(apiCacheRead - hardcoded.cost.cacheRead) > epsilon) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.cacheRead",
          hardcoded: hardcoded.cost.cacheRead,
          api: apiCacheRead,
        });
      }
      // Cache write
      const apiCacheWrite = meta.pricing.cached_output_per_million ?? 0;
      if (Math.abs(apiCacheWrite - hardcoded.cost.cacheWrite) > epsilon) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.cacheWrite",
          hardcoded: hardcoded.cost.cacheWrite,
          api: apiCacheWrite,
        });
      }
    }

    // Check maxTokens. A null `max_output_tokens` means the API imposes no
    // separate output cap, so output is bounded by the context window.
    // Models with a context-window override are bounded by the enforced
    // serving limit instead of the advertised metadata.
    if (meta && contextOverride === undefined) {
      const expectedMaxTokens =
        meta.limits.max_output_tokens ?? apiModel.max_model_len;
      if (expectedMaxTokens !== hardcoded.maxTokens) {
        discrepancies.push({
          model: hardcoded.id,
          field: "maxTokens",
          hardcoded: hardcoded.maxTokens,
          api: expectedMaxTokens,
        });
      }
    }
  }

  // Check for API models not in hardcoded list
  for (const apiModel of apiModels) {
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (
      !hardcoded &&
      !LEGACY_NEURALWATT_MODEL_IDS.has(apiModel.id) &&
      !ALIAS_NEURALWATT_MODEL_IDS.has(apiModel.id)
    ) {
      discrepancies.push({
        model: apiModel.id,
        field: "exists",
        hardcoded: false,
        api: true,
      });
    }
  }

  return discrepancies;
}

describe("Neuralwatt models", () => {
  it("should match API model definitions", {
    timeout: 30000,
  }, async (context) => {
    const apiModels = await fetchApiModels();
    if (!apiModels) {
      context.skip("Neuralwatt model catalog unreachable");
      return;
    }

    const discrepancies = compareModels(apiModels, NEURALWATT_MODELS);

    if (discrepancies.length > 0) {
      console.error("\nModel discrepancies found:");
      console.error("==========================");
      for (const d of discrepancies) {
        if (d.field === "exists") {
          if (d.hardcoded) {
            console.error(`  ${d.model}: Missing from API`);
          } else {
            console.error(`  ${d.model}: Missing from hardcoded models (NEW)`);
          }
        } else {
          console.error(`  ${d.model}.${d.field}:`);
          console.error(`    hardcoded: ${JSON.stringify(d.hardcoded)}`);
          console.error(`    api:       ${JSON.stringify(d.api)}`);
        }
      }
      console.error("==========================\n");
    }

    expect(discrepancies).toHaveLength(0);
  });

  it("should never allow more output tokens than context", () => {
    for (const model of [
      ...NEURALWATT_MODELS,
      ...EARLY_ACCESS_NEURALWATT_MODELS,
    ]) {
      expect(model.maxTokens, model.id).toBeGreaterThan(0);
      expect(model.maxTokens, model.id).toBeLessThanOrEqual(
        model.contextWindow,
      );
    }
  });

  it("should keep early-access model IDs out of the public catalog", () => {
    const publicIds = new Set(NEURALWATT_MODELS.map((m) => m.id));
    for (const model of EARLY_ACCESS_NEURALWATT_MODELS) {
      expect(publicIds.has(model.id), model.id).toBe(false);
    }
  });

  it("should have unique model IDs", () => {
    const ids = NEURALWATT_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should expose DeepSeek V4 Flash with its public API metadata", () => {
    expect(
      NEURALWATT_MODELS.find((model) => model.id === "deepseek-v4-flash"),
    ).toMatchObject({
      name: "DeepSeek V4 Flash",
      reasoning: true,
      input: ["text"],
      cost: { input: 0.14, output: 0.28, cacheRead: 0.028, cacheWrite: 0 },
      contextWindow: 1048560,
      maxTokens: 65536,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        requiresReasoningContentOnAssistantMessages: true,
      },
    });
  });

  it("should expose Gemma 4 31B with its public API metadata", () => {
    expect(
      NEURALWATT_MODELS.find((model) => model.id === "gemma-4-31b"),
    ).toMatchObject({
      name: "Gemma 4 31B",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0.144, output: 0.42, cacheRead: 0.0144, cacheWrite: 0 },
      contextWindow: 262128,
      maxTokens: 16384,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        requiresReasoningContentOnAssistantMessages: true,
      },
    });
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

  it("should only include legacy model IDs when enabled", () => {
    const defaultIds = new Set(getNeuralwattModels().map((m) => m.id));
    const legacyIds = new Set(
      getNeuralwattModels({ includeLegacyModelIds: true }).map((m) => m.id),
    );

    for (const legacyId of LEGACY_NEURALWATT_MODEL_IDS) {
      expect(defaultIds.has(legacyId)).toBe(false);
      expect(legacyIds.has(legacyId)).toBe(true);
    }
  });

  it("should only include alias model IDs when enabled", () => {
    const defaultIds = new Set(getNeuralwattModels().map((m) => m.id));
    const aliasIds = new Set(
      getNeuralwattModels({ includeAliasedModelIds: true }).map((m) => m.id),
    );

    for (const aliasId of ALIAS_NEURALWATT_MODEL_IDS) {
      expect(defaultIds.has(aliasId)).toBe(false);
      expect(aliasIds.has(aliasId)).toBe(true);
    }
  });

  it("should only point alias model IDs at active models", () => {
    const activeIds = new Set([
      ...NEURALWATT_MODELS.map((model) => model.id),
      ...EARLY_ACCESS_NEURALWATT_MODELS.map((model) => model.id),
    ]);

    for (const [aliasId, canonicalId] of Object.entries(ALIAS_MODEL_MAP)) {
      expect(activeIds.has(canonicalId)).toBe(true);
      expect(LEGACY_NEURALWATT_MODEL_IDS.has(canonicalId)).toBe(false);
      expect(LEGACY_NEURALWATT_MODEL_IDS.has(aliasId)).toBe(false);
    }
  });

  it("should keep alias and legacy model ID sets separate", () => {
    for (const aliasId of ALIAS_NEURALWATT_MODEL_IDS) {
      expect(LEGACY_NEURALWATT_MODEL_IDS.has(aliasId)).toBe(false);
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

  it("should expose Kimi K3 with its public API metadata", () => {
    expect(
      NEURALWATT_MODELS.find((model) => model.id === "kimi-k3"),
    ).toMatchObject({
      name: "Kimi K3",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
      // The API advertises 1,048,560 with a null output cap, but the serving
      // limit is 327,680 total (see CONTEXT_WINDOW_OVERRIDES).
      contextWindow: 327680,
      maxTokens: 327680,
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        requiresReasoningContentOnAssistantMessages: true,
      },
    });
  });

  it("should expose Kimi K3 Fast with thinking disabled", () => {
    expect(
      NEURALWATT_MODELS.find((model) => model.id === "kimi-k3-fast"),
    ).toMatchObject({
      name: "Kimi K3 Fast",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
      contextWindow: 327680,
      maxTokens: 327680,
    });
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

  it("should fall back to a high-only map when no reasoning block exists", () => {
    // Kimi K2.7 Code's API metadata exposes no `reasoning` block, so the map
    // is the conservative fallback: only `high` enabled, `off` disabled.
    const k27 = NEURALWATT_MODELS.find((m) => m.id === "kimi-k2.7-code");
    expect(k27?.reasoning).toBe(true);
    expect(k27?.thinkingLevelMap).toEqual({
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
