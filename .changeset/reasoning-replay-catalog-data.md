---
"@aliou/pi-neuralwatt": minor
---

Reasoning replay is now per-model catalog data instead of a uniform wire rename (issue #111). The openai-completions payload injector no longer renames replayed `reasoning` to `reasoning_content` for every model: live validation (2026-10-07) found no Neuralwatt model needs a rewrite, so prior thinking is replayed under pi-ai's recorded `reasoning` signature unchanged for all models. A dated, per-model `reasoningReplay` decision table (`extensions/provider/models/reasoning-replay.ts`, keyed by exact model id) drives all three catalog build paths and lets a future template drift re-enable a rewrite for individual models via the `field`/`templateKwargs` knob. Also removes a dead Qwen3.8 chat-template compat override (never applied; `reasoning_effort: "none"` already disables thinking on that model).
