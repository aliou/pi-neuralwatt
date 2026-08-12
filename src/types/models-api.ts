export interface NeuralwattApiModelPricing {
  input_per_million: number;
  output_per_million: number;
  cached_input_per_million: number | null;
  cached_output_per_million: number | null;
  currency: string;
  pricing_tbd: boolean;
}

export interface NeuralwattApiModelCapabilities {
  tools: boolean;
  json_mode: boolean;
  vision: boolean;
  reasoning: boolean;
  reasoning_effort: boolean;
  streaming: boolean;
  system_role: boolean;
  developer_role: boolean;
}

/**
 * Reasoning effort values Neuralwatt accepts on the wire. Mirrors Pi's
 * `ModelThinkingLevel` (minus `off`, which the API spells `"none"`).
 */
export type NeuralwattReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * Per-model reasoning contract from `/v1/models`.
 *
 * `supported_efforts` is authoritative for which Pi thinking levels to expose:
 * the Pi map is built by identity (a level is enabled iff it appears here),
 * see `buildThinkingLevelMap` in `extensions/provider/models/build.ts`.
 * `default_effort` and `effort_aliases` are typed for fidelity but are not
 * consumed — Pi has no default-reasoning field and we expose native efforts
 * rather than aliasing unsupported ones.
 */
export interface NeuralwattApiModelReasoning {
  /** Whether the model reasons by default. */
  default_enabled: boolean;
  /** Whether reasoning cannot be turned off. Forces `off: null` in the map. */
  mandatory: boolean;
  /** Efforts the model truly supports; drives the Pi thinking level map. */
  supported_efforts: NeuralwattReasoningEffort[];
  /** Efforts the API accepts but aliases onto a supported one. Not consumed. */
  accepted_efforts?: NeuralwattReasoningEffort[];
  /** Server-side default. Not consumed; Pi has no default-reasoning field. */
  default_effort: NeuralwattReasoningEffort;
  /** Wire-level aliases from accepted to supported efforts. Not consumed. */
  effort_aliases?: Partial<
    Record<NeuralwattReasoningEffort, NeuralwattReasoningEffort>
  >;
}

export interface NeuralwattApiModelLimits {
  max_context_length: number;
  max_output_tokens: number | null;
  max_images: number | null;
}

export interface NeuralwattApiModelMetadata {
  display_name: string;
  description: string | null;
  provider: string;
  huggingface_id: string | null;
  pricing: NeuralwattApiModelPricing;
  capabilities: NeuralwattApiModelCapabilities;
  reasoning?: NeuralwattApiModelReasoning;
  limits: NeuralwattApiModelLimits;
  deprecated: boolean;
  deprecated_message: string | null;
}

export interface NeuralwattApiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  root?: string;
  parent?: string | null;
  max_model_len: number;
  metadata?: NeuralwattApiModelMetadata;
}

export interface NeuralwattApiModelsResponse {
  object: "list";
  data: NeuralwattApiModel[];
}
