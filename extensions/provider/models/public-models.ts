import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import {
  buildNeuralwattFamily,
  FLEX_COST_MULTIPLIER,
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
// https://portal.neuralwatt.com/docs/api/chat-completions#reasoning-effort
const GEMMA_4: NeuralwattModelFamily = {
  cost: { input: 0.144, output: 0.42, cacheRead: 0.0144 },
  vision: true,
  reasoningMetadata: {
    supported_efforts: ["max", "none"],
    mandatory: false,
  },
};

// ZhipuAI. GLM-5.2 natively supports `high` and `max` reasoning efforts;
// `xhigh` is an unsupported hole between them. Pi's `max` level (0.80.6) maps
// to GLM's top tier.
const GLM_5_2: NeuralwattModelFamily = {
  cost: { input: 1.45, output: 4.5, cacheRead: 0.145 },
  vision: false,
  reasoningMetadata: {
    supported_efforts: ["max", "high", "none"],
    mandatory: false,
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

// MoonshotAI. The K2.7 Code API exposes no `reasoning` block, so this family
// omits `reasoningMetadata`; `buildThinkingLevelMap` falls back to a high-only
// map with `off: null`, matching the upstream binary thinking toggle.
const KIMI_K2_7_CODE: NeuralwattModelFamily = {
  cost: { input: 0.95, output: 4.0, cacheRead: 0.095 },
  vision: true,
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
        costMultiplier: FLEX_COST_MULTIPLIER,
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
        // GLM-5.2 Fast pins thinking off by default, but keeps the parent's
        // full reasoning contract (`high`/`max`/`none`): sending
        // `reasoning_effort` re-enables thinking for that request.
        id: "glm-5.2-fast",
        name: "GLM-5.2 (fast)",
        contextWindow: 1048560,
        maxOutputTokens: null,
        reasoning: true,
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
        // Short/fast: pins thinking off but keeps the parent reasoning
        // contract, like glm-5.2-fast.
        id: "glm-5.2-short-fast",
        name: "GLM-5.2 (short, fast)",
        contextWindow: 199984,
        maxOutputTokens: 32000,
        reasoning: true,
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
        // Short/fast/flex: pins thinking off but keeps the parent reasoning
        // contract, like glm-5.2-fast.
        id: "glm-5.2-short-fast-flex",
        name: "GLM-5.2 (short, fast, flex)",
        contextWindow: 199984,
        maxOutputTokens: 32000,
        reasoning: true,
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
      {
        id: "kimi-k3-flex",
        name: "Kimi K3 (flex)",
        contextWindow: 1048560,
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
