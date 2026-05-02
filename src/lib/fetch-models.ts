import type { NeuralwattModelConfig } from "../extensions/provider/models";

const FETCH_TIMEOUT_MS = 15_000;

const NEURALWATT_BINARY_THINKING_LEVEL_MAP = {
  minimal: null,
  low: null,
  medium: "medium",
  high: null,
  xhigh: null,
} as const;

const GPT_OSS_THINKING_LEVEL_MAP = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: null,
} as const;

export interface ApiModelMetadata {
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

export interface ApiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  root?: string;
  parent?: string | null;
  max_model_len: number;
  metadata?: ApiModelMetadata;
}

export interface ApiResponse {
  object: "list";
  data: ApiModel[];
}

/** Identify fast variants by their owned_by field or naming convention. */
function isFastModel(model: ApiModel): boolean {
  if (model.owned_by === "neuralwatt") return true;
  return model.id.endsWith("-fast");
}

/** Map API model data to NeuralwattModelConfig. */
export function mapApiModel(model: ApiModel): NeuralwattModelConfig {
  const meta = model.metadata;
  const fast = isFastModel(model);

  // Base fields from top-level API data
  const result: NeuralwattModelConfig = {
    id: model.id,
    name: meta?.display_name ?? model.id,
    reasoning: meta?.capabilities.reasoning ?? false,
    contextWindow: model.max_model_len,
    maxTokens: 65536, // sensible default
    cost: {
      input: meta?.pricing.input_per_million ?? 0,
      output: meta?.pricing.output_per_million ?? 0,
      cacheRead: meta?.pricing.cached_input_per_million ?? 0,
      cacheWrite: meta?.pricing.cached_output_per_million ?? 0,
    },
    input: meta?.capabilities.vision ? ["text", "image"] : ["text"],
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  };

  if (fast) {
    result.fast = true;
  }

  // Override maxTokens from limits if available
  if (meta?.limits.max_output_tokens) {
    result.maxTokens = meta.limits.max_output_tokens;
  }

  if (result.reasoning) {
    result.thinkingLevelMap =
      model.id === "openai/gpt-oss-20b"
        ? GPT_OSS_THINKING_LEVEL_MAP
        : NEURALWATT_BINARY_THINKING_LEVEL_MAP;
  }

  return result;
}

export type FetchModelsResult =
  | { success: true; models: NeuralwattModelConfig[] }
  | {
      success: false;
      error: { message: string; kind: "timeout" | "network" | "cancelled" };
    };

/**
 * Fetch live model definitions from the Neuralwatt /v1/models endpoint.
 *
 * When the API returns metadata (pricing, capabilities, limits), those values
 * are used directly. Fields not exposed by the API fall back to sensible
 * defaults.
 */
export async function fetchModels(
  signal?: AbortSignal,
): Promise<FetchModelsResult> {
  const signals: AbortSignal[] = [AbortSignal.timeout(FETCH_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  const combined = AbortSignal.any(signals);

  try {
    const response = await fetch("https://api.neuralwatt.com/v1/models", {
      headers: {
        Referer: "https://pi.dev",
        "X-Title": "npm:@aliou/pi-neuralwatt",
      },
      signal: combined,
    });

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: `Failed to fetch models: ${response.status} ${response.statusText}`,
          kind: "network",
        },
      };
    }

    const data: ApiResponse = await response.json();

    // Filter out deprecated models
    const active = data.data.filter(
      (m) => !m.metadata?.deprecated && !m.metadata?.pricing.pricing_tbd,
    );

    const models = active.map(mapApiModel);
    return { success: true, models };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (
        combined.reason instanceof DOMException &&
        combined.reason.name === "TimeoutError"
      ) {
        return {
          success: false,
          error: { message: "Fetch models timed out", kind: "timeout" },
        };
      }
      return {
        success: false,
        error: { message: "Fetch models cancelled", kind: "cancelled" },
      };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: { message, kind: "network" } };
  }
}
