import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import {
  buildNeuralwattFamily,
  type NeuralwattModelFamily,
  type NeuralwattVariantSpec,
} from "./build";

// Public models returned by https://api.neuralwatt.com/v1/models.
// Pricing, capabilities, and limits are sourced from the API metadata fields;
// `maxTokens` is `metadata.limits.max_output_tokens ?? max_model_len`.
//
// Each reasoning family snapshots its `reasoning.supported_efforts` +
// `reasoning.mandatory` from the API; `buildThinkingLevelMap` turns that into
// the Pi thinking level map by identity (no aliasing). See `models.test.ts`
// for the drift check against the live catalog.

// DeepSeek V4 Flash: efforts max/high/none, not mandatory.
// https://api-docs.deepseek.com/guides/thinking_mode/
const DEEPSEEK_V4_FLASH: NeuralwattModelFamily = {
  cost: { input: 0.14, output: 0.28, cacheRead: 0.028 },
  vision: false,
  reasoningMetadata: {
    supported_efforts: ["max", "high", "none"],
    mandatory: false,
  },
};

// Google, served from NVIDIA's NVFP4 checkpoint. Gemma 4's chat template
// takes a boolean rather than an effort level, so the API only advertises
// `max` and `none`; every non-`none` request resolves to `max` upstream.
// It does not reason by default (`default_enabled: false`), but the model
// can produce reasoning traces when asked. See
// https://docs.neuralwatt.com/api/chat-completions.md
const GEMMA_4: NeuralwattModelFamily = {
  cost: { input: 0.144, output: 0.42, cacheRead: 0.0144 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: ["max", "none"],
    mandatory: false,
  },
};

// ZhipuAI. GLM-5.3 has mandatory reasoning and `none` is not offered:
// efforts are max/high/low (default max).
const GLM_5_3: NeuralwattModelFamily = {
  cost: { input: 1.45, output: 4.5, cacheRead: 0.145 },
  vision: false,
  reasoningMetadata: {
    supported_efforts: ["max", "high", "low"],
    mandatory: true,
  },
};

// ZhipuAI. GLM-5.3 Flash is the small GLM-5.3 tier: vision-capable, much
// cheaper than the flagship, with the same mandatory max/high/low reasoning
// contract as GLM-5.3.
const GLM_5_3_FLASH: NeuralwattModelFamily = {
  cost: { input: 0.15, output: 0.5, cacheRead: 0.03 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: ["max", "high", "low"],
    mandatory: true,
  },
};

// MoonshotAI. K3 supports reasoning efforts low/high/max (default max) and
// can be turned off (`mandatory: false`). The `-fast` endpoint is a shorthand
// to set thinking to off.
const KIMI_K3: NeuralwattModelFamily = {
  cost: { input: 3, output: 15, cacheRead: 0.3 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: ["max", "high", "low", "none"],
    mandatory: false,
  },
};

// MoonshotAI. K2.7 Code has mandatory reasoning with no selectable efforts
// (`supported_efforts: []`), so `buildThinkingLevelMap` nulls out every level.
const KIMI_K2_7_CODE: NeuralwattModelFamily = {
  cost: { input: 0.95, output: 4.0, cacheRead: 0.095 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: [],
    mandatory: true,
  },
};

// Qwen. Qwen3.6 35B only advertises `high` and `none`.
const QWEN_3_6_35B: NeuralwattModelFamily = {
  cost: { input: 0.29, output: 1.15, cacheRead: 0.029 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: ["high", "none"],
    mandatory: false,
  },
};

// Qwen. Qwen 3.8 27B tops out at `xhigh` (its default) and also supports
// `medium`, `low`, and `none`; there is no `max` effort. Reasoning is on by
// default but can be disabled.
const QWEN_3_8_27B: NeuralwattModelFamily = {
  cost: { input: 0.45, output: 3.2, cacheRead: 0.25 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: ["xhigh", "medium", "low", "none"],
    mandatory: false,
  },
};

const FAMILIES: [NeuralwattModelFamily, NeuralwattVariantSpec[]][] = [
  [
    DEEPSEEK_V4_FLASH,
    [
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        contextWindow: 1048560,
        maxOutputTokens: 65536,
        reasoning: true,
      },
      {
        id: "deepseek-v4-flash-flex",
        name: "DeepSeek V4 Flash (flex)",
        contextWindow: 1048560,
        maxOutputTokens: 65536,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
  [
    GEMMA_4,
    [
      {
        id: "gemma-4-31b",
        name: "Gemma 4 31B",
        contextWindow: 262128,
        maxOutputTokens: 16384,
        reasoning: true,
      },
    ],
  ],
  [
    GLM_5_3,
    [
      {
        id: "glm-5.3",
        name: "GLM 5.3",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "glm-5.3-flex",
        name: "GLM 5.3 (flex)",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
  [
    GLM_5_3_FLASH,
    [
      {
        id: "glm-5.3-flash",
        name: "GLM-5.3 Flash",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "glm-5.3-flash-flex",
        name: "GLM-5.3 Flash (flex)",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
  [
    KIMI_K3,
    [
      {
        id: "kimi-k3",
        name: "Kimi K3",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "kimi-k3-fast",
        name: "Kimi K3 Fast",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: false,
      },
      {
        id: "kimi-k3-flex",
        name: "Kimi K3 (flex)",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
  [
    KIMI_K2_7_CODE,
    [
      {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        // K2.7 Code cannot disable thinking; the -fast variant caps the
        // reasoning budget (~64 tokens) rather than turning it off.
        id: "kimi-k2.7-code-fast",
        name: "Kimi K2.7 Code Fast",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "kimi-k2.7-code-flex",
        name: "Kimi K2.7 Code (flex)",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
  [
    QWEN_3_6_35B,
    [
      {
        id: "qwen3.6-35b",
        name: "Qwen3.6 35B",
        contextWindow: 131056,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "qwen3.6-35b-fast",
        name: "Qwen3.6 35B Fast",
        contextWindow: 131056,
        maxOutputTokens: null,
        reasoning: false,
      },
      {
        id: "qwen3.6-35b-flex",
        name: "Qwen3.6 35B (flex)",
        contextWindow: 131056,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
  [
    QWEN_3_8_27B,
    [
      {
        id: "qwen-3.8-27b",
        name: "Qwen 3.8 27B",
        contextWindow: 262128,
        maxOutputTokens: 131072,
        reasoning: true,
      },
      {
        id: "qwen-3.8-27b-flex",
        name: "Qwen 3.8 27B (flex)",
        contextWindow: 262128,
        maxOutputTokens: 131072,
        reasoning: true,
        costMultiplier: 0.65,
      },
    ],
  ],
];

// `-flex` variants are the Flex tier: same model, context window, output cap,
// and prompt cache as the standard variant, admitted on spare capacity. The
// API lists them at discounted prices; the fallback mirrors that with
// `costMultiplier: 0.65` per variant.
// https://docs.neuralwatt.com/guides/flex-tier.md

export const NEURALWATT_MODELS: ProviderModelConfig[] = FAMILIES.flatMap(
  ([family, variants]) => buildNeuralwattFamily(family, variants),
);
