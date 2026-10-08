import type { NeuralwattCompiledModel } from "./build";

export interface ReasoningReplayDecision {
  kind: "no-rewrite" | "moot";
  verified: string;
  note?: string;
  knob?: NeuralwattCompiledModel["reasoningReplay"];
}

export const REASONING_REPLAY_DECISIONS: Readonly<
  Record<string, ReasoningReplayDecision>
> = {
  "kimi-k3": { kind: "no-rewrite", verified: "2026-10-07" },
  "kimi-k3-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "deepseek-v4-flash": { kind: "no-rewrite", verified: "2026-10-07" },
  "deepseek-v4-flash-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "deepseek-v4-flash-speed": { kind: "no-rewrite", verified: "2026-10-07" },
  "deepseek-v4.1-flash": { kind: "no-rewrite", verified: "2026-10-07" },
  "deepseek-v4.1-flash-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "deepseek-v4.1-flash-speed": { kind: "no-rewrite", verified: "2026-10-07" },
  "glm-5.3": { kind: "no-rewrite", verified: "2026-10-07" },
  "glm-5.3-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "glm-5.3-flash": { kind: "no-rewrite", verified: "2026-10-07" },
  "glm-5.3-flash-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "qwen-3.8-27b": { kind: "no-rewrite", verified: "2026-10-07" },
  "qwen-3.8-27b-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "mimo-v2.6-pro": { kind: "no-rewrite", verified: "2026-10-07" },
  "mimo-v2.6-pro-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-large": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-large-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-flash": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-flash-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-small": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-small-flex": { kind: "no-rewrite", verified: "2026-10-07" },

  "qwen3.6-35b": {
    kind: "moot",
    note: "server drops replayed historical thinking in both fields",
    verified: "2026-10-07",
  },
  "qwen3.6-35b-flex": {
    kind: "moot",
    note: "server drops replayed historical thinking in both fields",
    verified: "2026-10-07",
  },
  "kimi-k2.7-code": {
    kind: "moot",
    note: "server drops replayed historical thinking in both fields",
    verified: "2026-10-07",
  },
  "kimi-k2.7-code-fast": {
    kind: "moot",
    note: "server drops replayed historical thinking in both fields",
    verified: "2026-10-07",
  },
  "kimi-k2.7-code-flex": {
    kind: "moot",
    note: "server drops replayed historical thinking in both fields",
    verified: "2026-10-07",
  },
  "gemma-4-31b": {
    kind: "moot",
    note: "server drops replayed historical thinking in both fields",
    verified: "2026-10-07",
  },
};

export function withReasoningReplay(
  model: NeuralwattCompiledModel,
): NeuralwattCompiledModel {
  const { reasoningReplay: _stale, ...rest } = model;
  const decision = REASONING_REPLAY_DECISIONS[model.id];
  if (model.reasoning && decision?.knob) {
    return { ...rest, reasoningReplay: decision.knob };
  }
  return rest;
}
