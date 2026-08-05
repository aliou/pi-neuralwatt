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

// Binary thinking control (Kimi K2.x, Qwen3.x): no graded `reasoning_effort`
// upstream, only a thinking on/off toggle. Expose a single known-good Pi
// level; "high" stands in for standard full thinking.
const BINARY_THINKING: ThinkingLevelMap = {
  minimal: null,
  low: null,
  medium: null,
  high: "high",
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

// MoonshotAI. K3 is the largest open-weight model ever released, served in
// preview with limited concurrency. K3 always reasons (thinking cannot be
// disabled) and supports `reasoning_effort` values "low", "high", and "max"
// (default "max"). There is no "medium" tier upstream, so Pi's low/high/max
// map directly and `off`, `minimal`, `medium`, and `xhigh` are unsupported
// holes. The `-fast` endpoint is a shorthand to set thinking to off.
const KIMI_K3: NeuralwattModelFamily = {
  cost: { input: 3, output: 15, cacheRead: 0.3 },
  vision: true,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    xhigh: null,
    max: "max",
  },
};

// MoonshotAI.
const KIMI_K2_7_CODE: NeuralwattModelFamily = {
  cost: { input: 0.95, output: 4.0, cacheRead: 0.095 },
  vision: true,
  thinkingLevelMap: { off: null, ...BINARY_THINKING },
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
// The API now advertises flex variants but lists them at standard pricing;
// the 35% Flex discount is a billing-time concept applied here via
// `costMultiplier` rather than reflected in the catalog metadata.
// https://portal.neuralwatt.com/docs/guides/flex-tier

export const NEURALWATT_MODELS: ProviderModelConfig[] = FAMILIES.flatMap(
  ([family, variants]) => buildNeuralwattFamily(family, variants),
);
