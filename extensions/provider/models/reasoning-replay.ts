import type { NeuralwattCompiledModel } from "./build";

/**
 * A dated reasoning-replay decision for one catalog model.
 *
 * Replay of prior chain-of-thought is catalog data, never prefix matching:
 * every reasoning model carries an explicit, live-validated decision, and
 * non-reasoning models carry none. Serving chat templates drift with upstream
 * vLLM (the `reasoning` ⇄ `reasoning_content` rename history proves it), so
 * each decision is stamped with the date it was validated against live
 * serving and must be re-verified on serving-stack/template updates — the
 * same notify-me drift process as the model fallback sync.
 */
export interface ReasoningReplayDecision {
  /**
   * - `"no-rewrite"`: pi-ai's recorded replay signature (`reasoning`) renders
   *   verbatim on today's serving; no wire rewrite. The default.
   * - `"moot"`: the served template drops replayed historical thinking in
   *   *both* candidate fields, so no knob can change anything today. Tracked
   *   upstream; re-check on template updates.
   */
  kind: "no-rewrite" | "moot";
  /** UTC date (`YYYY-MM-DD`) of the live serving validation. */
  verified: string;
  /** Optional human-readable detail (e.g. why a decision is moot). */
  note?: string;
  /** The knob applied to the model, if any — none ships today. */
  knob?: NeuralwattCompiledModel["reasoningReplay"];
}

/**
 * Validated against live Neuralwatt serving on 2026-10-07: every reasoning
 * family renders replayed thinking under both `reasoning` and
 * `reasoning_content` identically, except the three "moot" families whose
 * templates drop replayed thinking entirely. Keyed by exact `model.id` —
 * never prefix-matched (`kimi-k3-fast` is non-reasoning and must never
 * inherit `kimi-k3`'s decision).
 */
export const REASONING_REPLAY_DECISIONS: Readonly<
  Record<string, ReasoningReplayDecision>
> = {
  // --- both fields render; rename optional → no rewrite (default) ---
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
  "nw-large": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-large-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-flash": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-flash-flex": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-small": { kind: "no-rewrite", verified: "2026-10-07" },
  "nw-small-flex": { kind: "no-rewrite", verified: "2026-10-07" },

  // --- neither field renders today; rename moot; track upstream ---
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

/**
 * Apply the catalog's replay decision to a compiled model. Called in all
 * three build paths (fallback, API refresh, store restore) so it is the
 * single source of truth: it overwrites any stale knob persisted in the
 * models store and never invents a knob for an unlisted model (default =
 * no rewrite).
 */
export function withReasoningReplay(
  model: NeuralwattCompiledModel,
): NeuralwattCompiledModel {
  // Strip first so a stale knob stored by an older build cannot survive a
  // decision that no longer carries one.
  const { reasoningReplay: _stale, ...rest } = model;
  const decision = REASONING_REPLAY_DECISIONS[model.id];
  if (model.reasoning && decision?.knob) {
    return { ...rest, reasoningReplay: decision.knob };
  }
  return rest;
}
