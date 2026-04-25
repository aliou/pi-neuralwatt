// Hardcoded models from Neuralwatt API
// Source: https://api.neuralwatt.com/v1/models
// Pricing: https://portal.neuralwatt.com/pricing
// max_model_len from /v1/models, pricing from /pricing page

import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";

export interface NeuralwattModelConfig extends ProviderModelConfig {
  /** Fast variant of a parent model (e.g. "glm-5-fast" is the fast variant of "zai-org/GLM-5.1-FP8"). */
  fast?: boolean;
}

const NEURALWATT_REASONING_EFFORT_MAP = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
} as const;

export const NEURALWATT_MODELS: NeuralwattModelConfig[] = [
  // Devstral Small 2 - Mistral
  {
    id: "mistralai/Devstral-Small-2-24B-Instruct-2512",
    name: "Devstral Small 2",
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0.12,
      output: 0.35,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5 Fast - ZhipuAI
  {
    id: "glm-5-fast",
    name: "GLM-5 Fast",
    reasoning: false,
    fast: true,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 202752,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5.1 - ZhipuAI
  {
    id: "zai-org/GLM-5.1-FP8",
    name: "GLM-5.1",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 202752,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5.1 Fast - ZhipuAI
  {
    id: "glm-5.1-fast",
    name: "GLM-5.1 Fast",
    reasoning: false,
    fast: true,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 202752,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GPT-OSS 20B - OpenAI
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.03,
      output: 0.16,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 16384,
    maxTokens: 4096,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // Kimi K2.5 - MoonshotAI
  {
    id: "moonshotai/Kimi-K2.5",
    name: "Kimi K2.5",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.52,
      output: 2.59,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // Kimi K2.5 Fast - MoonshotAI
  {
    id: "kimi-k2.5-fast",
    name: "Kimi K2.5 Fast",
    reasoning: false,
    fast: true,
    input: ["text", "image"],
    cost: {
      input: 0.52,
      output: 2.59,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // Kimi K2.6 - MoonshotAI
  {
    id: "moonshotai/Kimi-K2.6",
    name: "Kimi K2.6",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.69,
      output: 3.22,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // Kimi K2.6 Fast - MoonshotAI
  {
    id: "kimi-k2.6-fast",
    name: "Kimi K2.6 Fast",
    reasoning: true,
    fast: true,
    input: ["text", "image"],
    cost: {
      input: 0.69,
      output: 3.22,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // MiniMax M2.5 - MiniMax
  {
    id: "MiniMaxAI/MiniMax-M2.5",
    name: "MiniMax M2.5",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.35,
      output: 1.38,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 196608,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // Qwen3.5 397B - Qwen
  {
    id: "Qwen/Qwen3.5-397B-A17B-FP8",
    name: "Qwen3.5 397B",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.69,
      output: 4.14,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // Qwen3.5 397B Fast - Qwen
  {
    id: "qwen3.5-397b-fast",
    name: "Qwen3.5 397B Fast",
    reasoning: false,
    fast: true,
    input: ["text"],
    cost: {
      input: 0.69,
      output: 4.14,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // Qwen3.6 35B - Qwen
  {
    id: "Qwen/Qwen3.6-35B-A3B",
    name: "Qwen3.6 35B",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.05,
      output: 0.1,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      reasoningEffortMap: NEURALWATT_REASONING_EFFORT_MAP,
      maxTokensField: "max_tokens",
    },
  },
  // Qwen3.6 35B Fast (qwen3.6-35b-fast) - Qwen
  {
    id: "qwen3.6-35b-fast",
    name: "Qwen3.6 35B Fast",
    reasoning: false,
    fast: true,
    input: ["text"],
    cost: {
      input: 0.05,
      output: 0.1,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 131072,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
];
