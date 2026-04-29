import { describe, expect, it } from "vitest";
import type {
  ApiModel as FullApiModel,
  ApiResponse as FullApiResponse,
} from "../../lib/fetch-models";
import { mapApiModel } from "../../lib/fetch-models";
import { NEURALWATT_MODELS_CACHE } from "./models";

interface Discrepancy {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

async function fetchApiModels(): Promise<FullApiModel[]> {
  const apiKey = process.env.NEURALWATT_API_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Referer: "https://github.com/aliou/pi-neuralwatt",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch("https://api.neuralwatt.com/v1/models", {
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: FullApiResponse = await response.json();
  return data.data;
}

function compareModels(
  apiModels: FullApiModel[],
  hardcodedModels: typeof NEURALWATT_MODELS_CACHE,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      discrepancies.push({
        model: hardcoded.id,
        field: "exists",
        hardcoded: true,
        api: false,
      });
      continue;
    }

    // Check context window
    if (apiModel.max_model_len !== hardcoded.contextWindow) {
      discrepancies.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.max_model_len,
      });
    }

    // Check metadata-driven fields if available
    const meta = apiModel.metadata;
    if (meta) {
      // Check reasoning
      if (meta.capabilities.reasoning !== hardcoded.reasoning) {
        discrepancies.push({
          model: hardcoded.id,
          field: "reasoning",
          hardcoded: hardcoded.reasoning,
          api: meta.capabilities.reasoning,
        });
      }

      // Check pricing
      if (meta.pricing.input_per_million !== hardcoded.cost.input) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.input",
          hardcoded: hardcoded.cost.input,
          api: meta.pricing.input_per_million,
        });
      }
      if (meta.pricing.output_per_million !== hardcoded.cost.output) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.output",
          hardcoded: hardcoded.cost.output,
          api: meta.pricing.output_per_million,
        });
      }

      // Check vision
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
  }

  // Check for API models not in hardcoded list
  for (const apiModel of apiModels) {
    if (apiModel.metadata?.deprecated || apiModel.metadata?.pricing.pricing_tbd)
      continue;
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (!hardcoded) {
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
    const discrepancies = compareModels(apiModels, NEURALWATT_MODELS_CACHE);

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

  it("should map API models with metadata correctly", () => {
    // Simulate a reasoning model with reasoning_effort support (like gpt-oss-20b)
    const apiModelWithEffort: FullApiModel = {
      id: "openai/gpt-oss-20b",
      object: "model",
      created: 1777467968,
      owned_by: "vllm",
      root: "openai/gpt-oss-20b",
      parent: null,
      max_model_len: 16384,
      metadata: {
        display_name: "GPT-OSS 20B",
        description: "OpenAI GPT-OSS 20B",
        provider: "OpenAI",
        huggingface_id: null,
        pricing: {
          input_per_million: 0.03,
          output_per_million: 0.16,
          cached_input_per_million: null,
          cached_output_per_million: null,
          currency: "USD",
          pricing_tbd: false,
        },
        capabilities: {
          tools: true,
          json_mode: true,
          vision: false,
          reasoning: true,
          reasoning_effort: true,
          streaming: true,
          system_role: true,
          developer_role: false,
        },
        limits: {
          max_context_length: 16384,
          max_output_tokens: 4096,
          max_images: null,
        },
        deprecated: false,
        deprecated_message: null,
      },
    };

    const result = mapApiModel(apiModelWithEffort);
    expect(result.id).toBe("openai/gpt-oss-20b");
    expect(result.name).toBe("GPT-OSS 20B");
    expect(result.reasoning).toBe(true);
    expect(result.contextWindow).toBe(16384);
    expect(result.maxTokens).toBe(4096);
    expect(result.input).toEqual(["text"]);
    expect(result.cost.input).toBe(0.03);
    expect(result.cost.output).toBe(0.16);
    expect(
      (result.compat as Record<string, unknown>)?.supportsReasoningEffort,
    ).toBe(true);
    expect(result.fast).toBeUndefined();
  });

  it("should map fast variants correctly", () => {
    // Simulate a fast variant (owned by "neuralwatt")
    const fastModel: FullApiModel = {
      id: "qwen3.6-35b-fast",
      object: "model",
      created: 0,
      owned_by: "neuralwatt",
      max_model_len: 131072,
      metadata: {
        display_name: "Qwen3.6 35B Fast",
        description: "Fast variant",
        provider: "Qwen",
        huggingface_id: null,
        pricing: {
          input_per_million: 0.05,
          output_per_million: 0.1,
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
        },
        limits: {
          max_context_length: 131072,
          max_output_tokens: null,
          max_images: null,
        },
        deprecated: false,
        deprecated_message: null,
      },
    };

    const result = mapApiModel(fastModel);
    expect(result.id).toBe("qwen3.6-35b-fast");
    expect(result.fast).toBe(true);
    expect(result.reasoning).toBe(false);
    expect(
      (result.compat as Record<string, unknown>)?.supportsReasoningEffort,
    ).toBeUndefined();
  });

  it("should map vision models correctly", () => {
    const visionModel: FullApiModel = {
      id: "moonshotai/Kimi-K2.6",
      object: "model",
      created: 1777467965,
      owned_by: "vllm",
      root: "moonshotai/Kimi-K2.6",
      parent: null,
      max_model_len: 262144,
      metadata: {
        display_name: "Kimi K2.6",
        description: "Moonshot Kimi K2.6",
        provider: "MoonshotAI",
        huggingface_id: null,
        pricing: {
          input_per_million: 0.69,
          output_per_million: 3.22,
          cached_input_per_million: null,
          cached_output_per_million: null,
          currency: "USD",
          pricing_tbd: false,
        },
        capabilities: {
          tools: true,
          json_mode: true,
          vision: true,
          reasoning: true,
          reasoning_effort: false,
          streaming: true,
          system_role: true,
          developer_role: false,
        },
        limits: {
          max_context_length: 262144,
          max_output_tokens: null,
          max_images: 20,
        },
        deprecated: false,
        deprecated_message: null,
      },
    };

    const result = mapApiModel(visionModel);
    expect(result.input).toEqual(["text", "image"]);
    expect(result.reasoning).toBe(true);
    expect(
      (result.compat as Record<string, unknown>)?.supportsReasoningEffort,
    ).toBeUndefined();
  });

  it("should use defaults when metadata is missing", () => {
    const bareModel: FullApiModel = {
      id: "test/model",
      object: "model",
      created: 0,
      owned_by: "vllm",
      max_model_len: 8192,
    };

    const result = mapApiModel(bareModel);
    expect(result.id).toBe("test/model");
    expect(result.name).toBe("test/model");
    expect(result.reasoning).toBe(false);
    expect(result.contextWindow).toBe(8192);
    expect(result.maxTokens).toBe(65536);
    expect(result.input).toEqual(["text"]);
    expect(result.cost.input).toBe(0);
    expect(result.cost.output).toBe(0);
    expect(result.fast).toBeUndefined();
    expect(
      (result.compat as Record<string, unknown>)?.supportsReasoningEffort,
    ).toBeUndefined();
  });
});
