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
