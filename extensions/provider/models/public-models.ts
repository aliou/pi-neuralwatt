import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import {
  buildNeuralwattFamily,
  FLEX_COST_MULTIPLIER,
  type NeuralwattModelFamily,
  type NeuralwattVariantSpec,
  type ThinkingLevelMap,
} from "./build";

// Public models returned by https://api.neuralwatt.com/v1/models.
// Pricing, capabilities, and limits are sourced from the API metadata fields;
// `maxTokens` is `metadata.limits.max_output_tokens ?? max_model_len`.
//
// Models are declared per family so every variant (`-fast`, `-flex`, `-short`)
// inherits the family's pricing, modalities, and thinking levels. See
// `models.test.ts` for the drift check against the live catalog.

// GLM natively supports `high` and `max` reasoning efforts. `xhigh` is an
// unsupported hole between them. Pi added the `max` level in 0.80.6.
const GLM_THINKING: ThinkingLevelMap = {
  off: "none",
  minimal: null,
  low: null,
  medium: null,
  high: "high",
  xhigh: null,
  max: "max",
};

// Binary thinking control: expose a single known-good Pi level.
const BINARY_THINKING: ThinkingLevelMap = {
  minimal: null,
  low: null,
  medium: "medium",
  high: null,
  xhigh: null,
};

const DEEPSEEK_V4_FLASH: NeuralwattModelFamily = {
  cost: { input: 0.14, output: 0.28, cacheRead: 0.028 },
  vision: false,
  // DeepSeek V4 Flash accepts reasoning_effort low/high/max (default high);
  // there is no "medium" tier, so Pi's low/high/max map directly and
  // minimal/medium/xhigh are unsupported holes.
  // https://api-docs.deepseek.com/guides/thinking_mode/
  thinkingLevelMap: {
    off: "none",
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    xhigh: null,
    max: "max",
  },
};

// Google, served from NVIDIA's NVFP4 checkpoint.
const GEMMA_4: NeuralwattModelFamily = {
  cost: { input: 0.144, output: 0.42, cacheRead: 0.0144 },
  vision: true,
};

// ZhipuAI.
const GLM_5_2: NeuralwattModelFamily = {
  cost: { input: 1.45, output: 4.5, cacheRead: 0.145 },
  vision: false,
  thinkingLevelMap: GLM_THINKING,
};

// MoonshotAI.
const KIMI_K2_6: NeuralwattModelFamily = {
  cost: { input: 0.69, output: 3.22, cacheRead: 0.069 },
  vision: true,
  thinkingLevelMap: BINARY_THINKING,
};

// MoonshotAI.
const KIMI_K2_7_CODE: NeuralwattModelFamily = {
  cost: { input: 0.95, output: 4.0, cacheRead: 0.095 },
  vision: true,
  thinkingLevelMap: { off: null, ...BINARY_THINKING },
};

// Qwen.
const QWEN_3_5_397B: NeuralwattModelFamily = {
  cost: { input: 0.69, output: 4.14, cacheRead: 0.069 },
  vision: false,
  thinkingLevelMap: BINARY_THINKING,
};

// Qwen.
const QWEN_3_6_35B: NeuralwattModelFamily = {
  cost: { input: 0.29, output: 1.15, cacheRead: 0.029 },
  vision: true,
  thinkingLevelMap: BINARY_THINKING,
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
        reasoning: false,
      },
    ],
  ],
  [
    GLM_5_2,
    [
      {
        id: "glm-5.2",
        name: "GLM-5.2",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "glm-5.2-fast",
        name: "GLM-5.2 Fast",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: false,
      },
      {
        id: "glm-5.2-flex",
        name: "GLM-5.2 (flex)",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: FLEX_COST_MULTIPLIER,
      },
      {
        id: "glm-5.2-short",
        name: "GLM-5.2 Short",
        contextWindow: 199984,
        maxOutputTokens: 32000,
        reasoning: true,
      },
      {
        id: "glm-5.2-short-fast",
        name: "GLM-5.2 Short Fast",
        contextWindow: 199984,
        maxOutputTokens: 32000,
        reasoning: false,
      },
      {
        id: "glm-5.2-short-flex",
        name: "GLM-5.2 (short, flex)",
        contextWindow: 199984,
        maxOutputTokens: 32000,
        reasoning: true,
        costMultiplier: FLEX_COST_MULTIPLIER,
      },
      {
        id: "glm-5.2-short-fast-flex",
        name: "GLM-5.2 (short, fast, flex)",
        contextWindow: 199984,
        maxOutputTokens: 32000,
        reasoning: false,
        costMultiplier: FLEX_COST_MULTIPLIER,
      },
    ],
  ],
  [
    KIMI_K2_6,
    [
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "kimi-k2.6-fast",
        name: "Kimi K2.6 Fast",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: false,
      },
      {
        id: "kimi-k2.6-flex",
        name: "Kimi K2.6 (flex)",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: FLEX_COST_MULTIPLIER,
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
        id: "kimi-k2.7-code-fast",
        name: "Kimi K2.7 Code Fast",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: false,
      },
      {
        id: "kimi-k2.7-code-flex",
        name: "Kimi K2.7 Code (flex)",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
        costMultiplier: FLEX_COST_MULTIPLIER,
      },
    ],
  ],
  [
    QWEN_3_5_397B,
    [
      {
        id: "qwen3.5-397b",
        name: "Qwen3.5 397B",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: true,
      },
      {
        id: "qwen3.5-397b-fast",
        name: "Qwen3.5 397B Fast",
        contextWindow: 262128,
        maxOutputTokens: null,
        reasoning: false,
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
    ],
  ],
];

// `-flex` variants are the Flex tier: same model, context window, output cap,
// and prompt cache as the standard variant, admitted on spare capacity.
// /v1/models does not advertise them (not even to an authenticated key), so they
// stay hardcoded here and the drift check in models.test.ts skips them.
// https://portal.neuralwatt.com/docs/guides/flex-tier

export const NEURALWATT_MODELS: ProviderModelConfig[] = FAMILIES.flatMap(
  ([family, variants]) => buildNeuralwattFamily(family, variants),
);
