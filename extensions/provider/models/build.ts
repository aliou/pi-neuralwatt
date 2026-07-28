import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

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
  /** Thinking levels used by reasoning variants of this family. */
  thinkingLevelMap?: ThinkingLevelMap;
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
  thinkingLevelMap?: ThinkingLevelMap;
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
    const thinkingLevelMap =
      variant.thinkingLevelMap ?? family.thinkingLevelMap;
    if (!thinkingLevelMap) {
      throw new Error(
        `Missing thinkingLevelMap for reasoning model ${variant.id}`,
      );
    }
    // Clone so variants never share a family map instance.
    model.thinkingLevelMap = { ...thinkingLevelMap };
  }

  return model;
}

export function buildNeuralwattFamily(
  family: NeuralwattModelFamily,
  variants: NeuralwattVariantSpec[],
): ProviderModelConfig[] {
  return variants.map((variant) => buildNeuralwattModel(family, variant));
}
