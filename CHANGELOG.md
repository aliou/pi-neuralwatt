# @aliou/pi-extension-template

## 0.3.0

### Minor Changes

- 5e722f6: Update Pi dependencies to 0.72.0 and migrate reasoning model controls to `thinkingLevelMap`.

### Patch Changes

- 9034be4: Respect `PI_OFFLINE` environment variable. Live model fetching on session start is now skipped when `PI_OFFLINE` is set to `1`, `true`, or `yes`, keeping the hardcoded cache active.

## 0.2.0

### Minor Changes

- 6f4672e: Fetch live models from Neuralwatt API on session start. The extension registers with a hardcoded model cache immediately on startup, then fetches `/v1/models` on session start and re-registers the provider with live data (including pricing, capabilities, and limits from the new API metadata). A notification is shown when live models differ from the cache. Falls back to the hardcoded cache if the fetch fails.

### Patch Changes

- 0669972: Align model definitions with Neuralwatt API metadata: set reasoning true for GPT-OSS 20B, set reasoning false for Kimi K2.6 Fast, and remove unsupported supportsReasoningEffort from GLM-5.1, Kimi K2.5, Kimi K2.6, MiniMax M2.5, Qwen3.5 397B, and Qwen3.6 35B. Add supportsReasoningEffort to GPT-OSS 20B.

## 0.1.2

### Patch Changes

- 579e814: Add Kimi K2.6 and Kimi K2.6 Fast models, remove stale qwen3.5-35b-fast

## 0.1.1

### Patch Changes

- 236264a: Fix settings documentation in README.

## 0.1.0

### Minor Changes

- 6b95048: Initial release of pi-neuralwatt — Neuralwatt inference API provider with energy transparency.

## 0.0.1

### Patch Changes

- Initial release
