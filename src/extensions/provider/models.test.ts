import { describe, expect, it } from "vitest";
import {
  getNeuralwattModels,
  LEGACY_NEURALWATT_MODEL_IDS,
  NEURALWATT_MODELS,
} from "./models";

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

async function fetchApiModels(): Promise<ApiModel[]> {
  const response = await fetch("https://api.neuralwatt.com/v1/models", {
    headers: {
      Referer: "https://github.com/aliou/pi-neuralwatt",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    },
  });

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

    // Check context window
    if (apiModel.max_model_len !== hardcoded.contextWindow) {
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

    // Check pricing
    if (meta) {
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

    // Check maxTokens when API provides it
    if (
      meta?.limits.max_output_tokens !== null &&
      meta?.limits.max_output_tokens !== undefined
    ) {
      if (meta.limits.max_output_tokens !== hardcoded.maxTokens) {
        discrepancies.push({
          model: hardcoded.id,
          field: "maxTokens",
          hardcoded: hardcoded.maxTokens,
          api: meta.limits.max_output_tokens,
        });
      }
    }
  }

  // Check for API models not in hardcoded list
  for (const apiModel of apiModels) {
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (!hardcoded && !LEGACY_NEURALWATT_MODEL_IDS.has(apiModel.id)) {
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
  it("should match API model definitions", { timeout: 30000 }, async () => {
    const apiModels = await fetchApiModels();
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
    expect(byId.get("kimi-k2.6-flex")?.thinkingLevelMap).toEqual(
      byId.get("kimi-k2.6")?.thinkingLevelMap,
    );
    expect(byId.get("kimi-k2.7-code-flex")?.thinkingLevelMap).toEqual(
      byId.get("kimi-k2.7-code")?.thinkingLevelMap,
    );
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

  it("should have valid thinkingLevelMap for reasoning models", () => {
    const reasoningModels = NEURALWATT_MODELS.filter((m) => m.reasoning);

    for (const model of reasoningModels) {
      expect(model.thinkingLevelMap).toBeDefined();
      expect(model.thinkingLevelMap).toHaveProperty("minimal");
      expect(model.thinkingLevelMap).toHaveProperty("low");
      expect(model.thinkingLevelMap).toHaveProperty("medium");
      expect(model.thinkingLevelMap).toHaveProperty("high");
      expect(model.thinkingLevelMap).toHaveProperty("xhigh");
    }
  });
});
