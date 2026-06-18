// Hardcoded models from Neuralwatt API
// Source: https://api.neuralwatt.com/v1/models
// Pricing, capabilities, and limits from metadata fields in /v1/models

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export const NEURALWATT_MODELS: ProviderModelConfig[] = [
  // GLM-5.1 (200K vLLM deployment) - ZhipuAI
  // Legacy id previously aliased to glm-5.1; now serving a GLM-5.2 test build.
  {
    id: "zai-org/GLM-5.1-FP8",
    name: "GLM-5.2 (test)",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
    // Backed by GLM-5.2 (redirect in effect). Mirror glm-5.2's native reasoning
    // depths (high, max) plus thinking-off. Do not rely on Neuralwatt's
    // server-side default-to-high injection for the GLM-5.1 redirect.
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "max",
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // GLM-5.1 - ZhipuAI
  // Fully deprecated; now serves the GLM-5.2 deployment via Neuralwatt's
  // redirect. Tracked as a legacy alias of glm-5.2 (see LEGACY_MODEL_ALIAS_MAP);
  // pricing will converge to GLM-5.2's as the redirect rolls out.

  // GLM-5.1 Fast - ZhipuAI
  {
    id: "glm-5.1-fast",
    name: "GLM-5.1 Fast",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5.2 - ZhipuAI (test canary)
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
    // GLM-5.2 has two native reasoning depths (high, max) plus thinking-off.
    // Pi levels below high disable thinking; high -> high, xhigh -> max.
    // See https://portal.neuralwatt.com/docs/api/chat-completions#reasoning-effort
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "max",
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // GLM-5.2 Fast - ZhipuAI
  {
    id: "glm-5.2-fast",
    name: "GLM-5.2 Fast",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
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
    contextWindow: 262128,
    maxTokens: 65536,
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // Kimi K2.5 Fast - MoonshotAI
  {
    id: "kimi-k2.5-fast",
    name: "Kimi K2.5 Fast",
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0.52,
      output: 2.59,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262128,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // Kimi K2.6 - MoonshotAI
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.69,
      output: 3.22,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262128,
    maxTokens: 65536,
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // Kimi K2.6 Fast - MoonshotAI
  {
    id: "kimi-k2.6-fast",
    name: "Kimi K2.6 Fast",
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0.69,
      output: 3.22,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262128,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // Qwen3.5 397B - Qwen
  {
    id: "qwen3.5-397b",
    name: "Qwen3.5 397B",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.69,
      output: 4.14,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262128,
    maxTokens: 65536,
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // Qwen3.5 397B Fast - Qwen
  {
    id: "qwen3.5-397b-fast",
    name: "Qwen3.5 397B Fast",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0.69,
      output: 4.14,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262128,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // Qwen3.6 35B - Qwen
  {
    id: "qwen3.6-35b",
    name: "Qwen3.6 35B",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.29,
      output: 1.15,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 131056,
    maxTokens: 65536,
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // Kimi K2.7 Code - MoonshotAI
  {
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.95,
      output: 4.0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 262128,
    maxTokens: 65536,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: "medium",
      high: null,
      xhigh: null,
    },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  // Qwen3.6 35B Fast - Qwen
  {
    id: "qwen3.6-35b-fast",
    name: "Qwen3.6 35B Fast",
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0.29,
      output: 1.15,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 131056,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
];

const LEGACY_MODEL_ALIAS_MAP = {
  "glm-5.1": "glm-5.2",
  "moonshotai/Kimi-K2.6": "kimi-k2.6",
  "Qwen/Qwen3.5-397B-A17B-FP8": "qwen3.5-397b",
  "Qwen/Qwen3.6-35B-A3B": "qwen3.6-35b",
} as const;

export const LEGACY_NEURALWATT_MODEL_IDS = new Set<string>(
  Object.keys(LEGACY_MODEL_ALIAS_MAP),
);

const LEGACY_NEURALWATT_MODELS: ProviderModelConfig[] = Object.entries(
  LEGACY_MODEL_ALIAS_MAP,
).map(([legacyId, canonicalId]) => {
  const canonical = NEURALWATT_MODELS.find((model) => model.id === canonicalId);

  if (!canonical) {
    throw new Error(`Missing canonical model for legacy alias ${legacyId}`);
  }

  return {
    ...canonical,
    id: legacyId,
    name: `${canonical.name} (legacy ID)`,
  };
});

export function getNeuralwattModels(options?: {
  includeLegacyModelIds?: boolean;
}): ProviderModelConfig[] {
  if (options?.includeLegacyModelIds)
    return [...NEURALWATT_MODELS, ...LEGACY_NEURALWATT_MODELS];

  return NEURALWATT_MODELS;
}
