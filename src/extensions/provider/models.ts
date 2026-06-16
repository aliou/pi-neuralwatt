// Hardcoded models from Neuralwatt API
// Source: https://api.neuralwatt.com/v1/models
// Pricing, capabilities, and limits from metadata fields in /v1/models

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export const NEURALWATT_MODELS: ProviderModelConfig[] = [
  // GLM-5 Fast - ZhipuAI
  {
    id: "glm-5-fast",
    name: "GLM-5 Fast",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 202736,
    maxTokens: 65536,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
    },
  },
  // GLM-5.1 - ZhipuAI
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 1.1,
      output: 3.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 202736,
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
    contextWindow: 202736,
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
  "zai-org/GLM-5.1-FP8": "glm-5.1",
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

interface NeuralwattApiModel {
  id: string;
  metadata: {
    display_name: string | null;
    provider: string;
    capabilities: {
      vision: boolean;
      reasoning: boolean;
      developer_role: boolean;
    };
    limits: {
      max_context_length: number;
      max_output_tokens: number | null;
    };
    pricing: {
      input_per_million: number;
      output_per_million: number;
      cached_input_per_million: number | null;
      cached_output_per_million: number | null;
    };
  };
}

export async function fetchNeuralwattModels(): Promise<ProviderModelConfig[] | undefined> {
  try {
    const response = await fetch("https://api.neuralwatt.com/v1/models");
    if (!response.ok) return undefined;
    const data = (await response.json()) as { data: NeuralwattApiModel[] };
    if (!Array.isArray(data.data)) return undefined;

    return data.data.map((model) => {
      const md = model.metadata;
      const reasoning = md.capabilities.reasoning;
      const input: ("text" | "image")[] = ["text"];
      if (md.capabilities.vision) input.push("image");

      const config: ProviderModelConfig = {
        id: model.id,
        name: md.display_name ?? model.id,
        reasoning,
        input,
        cost: {
          input: md.pricing.input_per_million,
          output: md.pricing.output_per_million,
          cacheRead: md.pricing.cached_input_per_million ?? 0,
          cacheWrite: md.pricing.cached_output_per_million ?? 0,
        },
        contextWindow: md.limits.max_context_length,
        maxTokens: md.limits.max_output_tokens ?? 65536,
        compat: {
          supportsDeveloperRole: md.capabilities.developer_role,
          maxTokensField: "max_tokens",
        },
      };

      if (reasoning) {
        config.thinkingLevelMap = {
          minimal: null,
          low: null,
          medium: "medium",
          high: null,
          xhigh: null,
        };
        config.compat = {
          ...config.compat,
          requiresReasoningContentOnAssistantMessages: true,
        };
      }

      return config;
    });
  } catch {
    return undefined;
  }
}

export function buildModelList(
  models: ProviderModelConfig[],
  includeLegacyModelIds?: boolean,
): ProviderModelConfig[] {
  if (!includeLegacyModelIds) return models;

  const legacy: ProviderModelConfig[] = [];
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_MODEL_ALIAS_MAP)) {
    const canonical = models.find((m) => m.id === canonicalId);
    if (!canonical) continue;
    legacy.push({
      ...canonical,
      id: legacyId,
      name: `${canonical.name} (legacy ID)`,
    });
  }
  return [...models, ...legacy];
}

export function getNeuralwattModels(options?: {
  includeLegacyModelIds?: boolean;
}): ProviderModelConfig[] {
  if (options?.includeLegacyModelIds)
    return [...NEURALWATT_MODELS, ...LEGACY_NEURALWATT_MODELS];

  return NEURALWATT_MODELS;
}
