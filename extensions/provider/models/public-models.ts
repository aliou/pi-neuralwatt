import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// Public models returned by https://api.neuralwatt.com/v1/models (unauthenticated view).
// Pricing, capabilities, and limits are sourced from the API metadata fields.
export const NEURALWATT_MODELS: ProviderModelConfig[] = [
  // GLM-5.2 - ZhipuAI
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
    thinkingLevelMap: {
      off: "none",
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
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5.2 Short - ZhipuAI (200K context, bounded reasoning budget)
  {
    id: "glm-5.2-short",
    name: "GLM-5.2 Short",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 199984,
    maxTokens: 65536,
    thinkingLevelMap: {
      off: "none",
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
  // GLM-5.2 Short Fast - ZhipuAI (200K context, reasoning disabled)
  {
    id: "glm-5.2-short-fast",
    name: "GLM-5.2 Short Fast",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 199984,
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
      cacheRead: 0.1725,
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
      cacheRead: 0.1725,
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
      cacheRead: 0.1725,
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
      cacheRead: 0.1725,
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
      cacheRead: 0.0725,
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
      cacheRead: 0.2375,
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
  // GLM-5.2 Short Fast Flex - ZhipuAI (flex variant, reasoning disabled)
  {
    id: "glm-5.2-short-fast-flex",
    name: "GLM-5.2 (short, fast, flex)",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 199984,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5.2 Short Flex - ZhipuAI (flex variant)
  {
    id: "glm-5.2-short-flex",
    name: "GLM-5.2 (short, flex)",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 199984,
    maxTokens: 65536,
    thinkingLevelMap: {
      off: "none",
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
  // Kimi K2.6 Flex - MoonshotAI (flex variant)
  {
    id: "kimi-k2.6-flex",
    name: "Kimi K2.6 (flex)",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.69,
      output: 3.22,
      cacheRead: 0.1725,
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
  // Kimi K2.7 Code Flex - MoonshotAI (flex variant)
  {
    id: "kimi-k2.7-code-flex",
    name: "Kimi K2.7 Code (flex)",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.95,
      output: 4.0,
      cacheRead: 0.2375,
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
  // GLM-5.2 Flex - ZhipuAI (flex variant)
  {
    id: "glm-5.2-flex",
    name: "GLM-5.2 (flex)",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.45,
      output: 4.5,
      cacheRead: 0.3625,
      cacheWrite: 0,
    },
    contextWindow: 1048560,
    maxTokens: 65536,
    thinkingLevelMap: {
      off: "none",
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
  // Qwen3.6 35B Fast - Qwen
  {
    id: "qwen3.6-35b-fast",
    name: "Qwen3.6 35B Fast",
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0.29,
      output: 1.15,
      cacheRead: 0.0725,
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
