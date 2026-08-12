import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type {
  NeuralwattApiModelReasoning,
  NeuralwattReasoningEffort,
} from "../../../src/types/models-api";

export type ThinkingLevelMap = NonNullable<
  ProviderModelConfig["thinkingLevelMap"]
>;

/**
 * Flex tier is billed at 65% of standard pricing (35% off) when the request
 * streams. A non-streaming request to a `-flex` model silently falls back to
 * the standard tier and the standard price.
 *
 * https://portal.neuralwatt.com/docs/guides/flex-tier
 */
export const FLEX_COST_MULTIPLIER = 0.65;

export interface NeuralwattCost {
  input: number;
  output: number;
  cacheRead: number;
}

/**
 * Shared metadata for every variant of a Neuralwatt model (base, `-fast`,
 * `-flex`, `-short`, ...). Variants only declare what differs.
 */
export interface NeuralwattModelFamily {
  cost: NeuralwattCost;
  vision: boolean;
  /**
   * Reasoning contract snapshot from `/v1/models` for reasoning variants.
   * `buildThinkingLevelMap` turns it into the Pi thinking level map.
   */
  reasoningMetadata?: NeuralwattReasoningMapSource;
}

export interface NeuralwattVariantSpec {
  id: string;
  name: string;
  /** `max_model_len` from /v1/models. */
  contextWindow: number;
  /**
   * `metadata.limits.max_output_tokens` from /v1/models. `null` means the API
   * imposes no separate output cap, so output is bounded by the context window.
   */
  maxOutputTokens: number | null;
  reasoning: boolean;
  cost?: Partial<NeuralwattCost>;
  /**
   * Multiplier applied to the family cost, e.g. the Flex tier discount.
   * Applied after any per-variant `cost` override.
   */
  costMultiplier?: number;
  vision?: boolean;
  /** Override the family reasoning contract for this variant. */
  reasoningMetadata?: NeuralwattReasoningMapSource;
}

/**
 * Subset of the API reasoning block needed to build the Pi thinking level map.
 * Kept narrow so public snapshots stay small and offline-friendly.
 */
export type NeuralwattReasoningMapSource = Pick<
  NeuralwattApiModelReasoning,
  "supported_efforts" | "mandatory"
>;

/**
 * Build the Pi thinking level map from the Neuralwatt reasoning contract.
 *
 * Pure identity mapping: a Pi level is enabled iff it appears in
 * `supported_efforts` (mapped to its own name), `null` otherwise. `off` maps to
 * `"none"` when the model permits disabling reasoning (`!mandatory` and
 * `"none"` is supported).
 *
 * When the reasoning block is missing (e.g. Kimi K2.7 Code, whose API metadata
 * exposes none), falls back to a conservative `high`-only map with `off: null`,
 * matching the upstream binary thinking toggle.
 *
 * `default_effort` and `effort_aliases` are deliberately ignored: Pi has no
 * default-reasoning field, and we expose native supported efforts rather than
 * aliasing unsupported ones.
 */
export function buildThinkingLevelMap(
  reasoning: NeuralwattReasoningMapSource | undefined,
): ThinkingLevelMap {
  // Conservative fallback for models whose API metadata has no reasoning
  // block. Expose one known-good level and forbid disabling reasoning.
  const supported = new Set<NeuralwattReasoningEffort>(
    reasoning?.supported_efforts ?? ["high"],
  );
  const mandatory = reasoning?.mandatory ?? true;

  return {
    off: !mandatory && supported.has("none") ? "none" : null,
    minimal: supported.has("minimal") ? "minimal" : null,
    low: supported.has("low") ? "low" : null,
    medium: supported.has("medium") ? "medium" : null,
    high: supported.has("high") ? "high" : null,
    xhigh: supported.has("xhigh") ? "xhigh" : null,
    max: supported.has("max") ? "max" : null,
  };
}

/**
 * Neuralwatt reports `max_output_tokens: null` for models whose output is only
 * bounded by the context window. Mirror the API instead of inventing a cap.
 */
export function resolveMaxTokens(
  maxOutputTokens: number | null | undefined,
  contextWindow: number,
): number {
  return maxOutputTokens ?? contextWindow;
}

export function buildNeuralwattModel(
  family: NeuralwattModelFamily,
  variant: NeuralwattVariantSpec,
): ProviderModelConfig {
  const vision = variant.vision ?? family.vision;

  const compat: NonNullable<ProviderModelConfig["compat"]> = {
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
  };
  if (variant.reasoning) {
    compat.requiresReasoningContentOnAssistantMessages = true;
  }

  const multiplier = variant.costMultiplier ?? 1;
  const scale = (value: number): number =>
    multiplier === 1 ? value : Number((value * multiplier).toFixed(6));

  const model: ProviderModelConfig = {
    id: variant.id,
    name: variant.name,
    reasoning: variant.reasoning,
    input: vision ? ["text", "image"] : ["text"],
    cost: {
      input: scale(variant.cost?.input ?? family.cost.input),
      output: scale(variant.cost?.output ?? family.cost.output),
      cacheRead: scale(variant.cost?.cacheRead ?? family.cost.cacheRead),
      cacheWrite: 0,
    },
    contextWindow: variant.contextWindow,
    maxTokens: resolveMaxTokens(variant.maxOutputTokens, variant.contextWindow),
    compat,
  };

  if (variant.reasoning) {
    // Clone so variants never share a family map instance. The map is derived
    // from the API reasoning contract; missing metadata falls back to a
    // high-only map rather than throwing.
    model.thinkingLevelMap = {
      ...buildThinkingLevelMap(
        variant.reasoningMetadata ?? family.reasoningMetadata,
      ),
    };
  }

  return model;
}

export function buildNeuralwattFamily(
  family: NeuralwattModelFamily,
  variants: NeuralwattVariantSpec[],
): ProviderModelConfig[] {
  return variants.map((variant) => buildNeuralwattModel(family, variant));
}
