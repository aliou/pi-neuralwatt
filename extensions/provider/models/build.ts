import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type {
  NeuralwattApiModelReasoning,
  NeuralwattReasoningEffort,
} from "../../../src/types/models-api";

export type ThinkingLevelMap = NonNullable<
  ProviderModelConfig["thinkingLevelMap"]
>;

/**
 * A compiled provider model plus the reasoning contract it was compiled from,
 * retained for anthropic-messages map derivation. Rides the models store
 * (JSON passthrough); stripped from stamped runtime models.
 */
export type NeuralwattCompiledModel = ProviderModelConfig & {
  reasoningContract?: NeuralwattReasoningMapSource;
};

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
  "supported_efforts" | "mandatory" | "effort_aliases"
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
 * `effort_aliases` is deliberately ignored here (the openai-completions
 * gateway aliases unsupported efforts server-side); it is consumed by the
 * anthropic-messages map below.
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
 * Thinking level map for the anthropic-messages surface. vLLM's
 * `output_config.effort` accepts only the model's native efforts, so
 * unsupported Pi levels resolve through `effort_aliases` (or `null`). A level
 * may resolve to `"none"` — off on this surface, handled by the payload
 * injector in `api/anthropic-messages.ts`.
 */
export function buildAnthropicThinkingLevelMap(
  reasoning: NeuralwattReasoningMapSource | undefined,
): ThinkingLevelMap {
  const supported = new Set<string>(reasoning?.supported_efforts ?? ["high"]);
  const mandatory = reasoning?.mandatory ?? true;
  const aliases = reasoning?.effort_aliases ?? {};

  const resolve = (level: string): string | null => {
    if (supported.has(level)) return level;
    const alias = aliases[level as keyof typeof aliases];
    return alias && supported.has(alias) ? alias : null;
  };

  return {
    // "none" is a marker so pi-ai enables the off path (off !== null);
    // vLLM rejects it on the wire, so the injector never sends it verbatim.
    off: !mandatory && supported.has("none") ? "none" : null,
    minimal: resolve("minimal"),
    low: resolve("low"),
    medium: resolve("medium"),
    high: resolve("high"),
    xhigh: resolve("xhigh"),
    max: resolve("max"),
  };
}

/**
 * Neuralwatt reports `max_output_tokens: null` for models whose output is only
 * bounded by the context window. Some models incorrectly report 0; treat 0
 * like null so we never emit maxTokens: 0.
 */
export function resolveMaxTokens(
  maxOutputTokens: number | null | undefined,
  contextWindow: number,
): number {
  if (maxOutputTokens === 0) return contextWindow;
  return maxOutputTokens ?? contextWindow;
}

export function buildNeuralwattModel(
  family: NeuralwattModelFamily,
  variant: NeuralwattVariantSpec,
): NeuralwattCompiledModel {
  const vision = variant.vision ?? family.vision;

  const compat: NonNullable<ProviderModelConfig["compat"]> = {
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
  };
  const multiplier = variant.costMultiplier ?? 1;
  const scale = (value: number): number =>
    multiplier === 1 ? value : Number((value * multiplier).toFixed(6));

  const model: NeuralwattCompiledModel = {
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
    const contract = variant.reasoningMetadata ?? family.reasoningMetadata;
    // Clone so variants never share a family map instance. The map is derived
    // from the API reasoning contract; missing metadata falls back to a
    // high-only map rather than throwing.
    model.thinkingLevelMap = {
      ...buildThinkingLevelMap(contract),
    };
    model.reasoningContract = contract;
  }

  return model;
}

export function buildNeuralwattFamily(
  family: NeuralwattModelFamily,
  variants: NeuralwattVariantSpec[],
): NeuralwattCompiledModel[] {
  return variants.map((variant) => buildNeuralwattModel(family, variant));
}
