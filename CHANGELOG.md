# @aliou/pi-extension-template

## 0.7.6

### Patch Changes

- d707a7e: Add public Neuralwatt flex model variants.
- ed64814: Remove deprecated Kimi K2.5 and Kimi K2.5 Fast from public model list, add as legacy aliases to Kimi K2.6

## 0.7.5

### Patch Changes

- 0d33249: Fix reasoning disable for glm-5.2 and glm-5.2-short. The `thinkingLevelMap` had no `off` entry, so turning thinking off sent no `reasoning_effort` and the model fell back to its default (reasoning on). Verified against the API that `reasoning_effort: "none"` produces zero reasoning content for both models; mapped `off: "none"` accordingly.

## 0.7.4

### Patch Changes

- cf60c30: Fix "No models match pattern" warning for models that graduated from hidden to public.
  A stale hidden-models cache could register newly public models twice, making Pi treat the scoped model as ambiguous. Now hidden models are deduped against the public list at registration, and `session_start` always rewrites the cache (even when empty) and re-registers the provider so graduated entries are purged.

## 0.7.3

### Patch Changes

- 42012c9: Add glm-5.2-short and glm-5.2-short-fast as public models (they graduated from private/hidden to the public /v1/models list).
- dc41261: Fix rate-limit errors always showing the generic fallback message.

  `wrapNeuralwattStreamSimple` captures 429 headers and formats a detailed,
  layer-specific message (e.g. "Concurrent request limit reached (6/5 active,
  user-scoped)"). But the `message_end` handler then overwrote any error
  containing "429" with "Neuralwatt rate limit reached, but Pi did not receive
  layer-specific rate-limit headers" — clobbering the wrap's output.

  The fallback only fired because `after_provider_response` never observes 429s:
  the OpenAI SDK throws before Pi's `onResponse` hook runs, so
  `pendingRateLimitInfo` is always undefined for 429s.

  Now skip the fallback when the wrap has already formatted a message (detected
  via the `429 rate limit:` prefix). The fallback is retained only for genuinely
  headerless 429s (e.g. anonymous playground limits, or infra in front of
  Neuralwatt).

## 0.7.2

### Patch Changes

- 6338c0a: Fix "No models match pattern" warnings for scoped hidden models.

  Hidden models were fetched inside `session_start`, but Pi validates scoped
  models during startup before `session_start` fires, so saved scoped entries
  like `neuralwatt/glm-5.2-short` warned every launch.

  Switch to stale-while-revalidate: the provider extension factory synchronously
  restores the previous session's fetch from
  `~/.pi/agent/cache/neuralwatt-hidden-models.json` so the provider is registered
  with hidden models at load time. `session_start` revalidates from the live API,
  writes the cache back, and re-registers the provider. First run with no cache
  still warns once.

## 0.7.1

### Patch Changes

- 83ad6f8: Convert `glm-5.1` into a legacy alias of `glm-5.2`. GLM-5.1 is fully deprecated on Neuralwatt and now serves the GLM-5.2 deployment via server redirect. Aliasing inherits GLM-5.2's reasoning depths (high, max) and pricing; the latter is expected to converge as the redirect rolls out. The standalone `glm-5.1` canonical entry is removed. `glm-5.1-fast` is unchanged.
- 5f62126: Reorganize Neuralwatt models into public, legacy, and hidden sections.

  - Move model definitions into `src/extensions/provider/models/` with separate files for public models, legacy aliases, and hidden-model discovery.
  - Add an `includeHiddenModels` setting (default `false`) that fetches accessible-but-unadvertised models from the authenticated `/v1/models` endpoint once per session start.
  - Move Neuralwatt API client calls into `src/lib/neuralwatt-api.ts`.
  - Update public model `cacheRead` pricing and move phased-out GLM-5.1 IDs to legacy aliases.

## 0.7.0

### Minor Changes

- 9384557: Handle Neuralwatt stream rate limits before the OpenAI SDK drops response headers. Show layer-specific 429 messages, keep Pi auto-retry detection working, and parse SSE quota comments for live quota updates.

### Patch Changes

- 57e5ac2: Sync model list with live Neuralwatt API. Remove deprecated glm-5-fast (no longer served). Fix zai-org/GLM-5.1-FP8 context window from 202736 to 1048560 (matches the GLM-5.2-backed 1048K deployment).
- 7ba08db: Sync model list with live Neuralwatt API. Add glm-5.2-fast and promote zai-org/GLM-5.1-FP8 from legacy alias to a standalone canonical entry (now serving a GLM-5.2 test build). Update glm-5.1 and glm-5.1-fast context windows to 1048560 (GLM-5.2-backed, 1048K).

## 0.6.3

### Patch Changes

- 53884f1: Fix GLM-5.2 thinkingLevelMap to match Neuralwatt's reasoning_effort normalization.

  GLM-5.2 has two native reasoning depths (high, max) plus thinking-off. Only expose
  the levels the model actually distinguishes: high -> high, xhigh -> max, and disable
  thinking (null) for minimal/low/medium so users get the behavior the level name implies
  instead of Neuralwatt silently normalizing low/medium to high.

- 56b63c1: Fix Kimi K2.7 Code model ID to match the Neuralwatt /v1/models listing.

  The live API exposes this model as `kimi-k2.7-code` (lowercase, no namespace),
  not `moonshotai/Kimi-K2.7-Code`. The previous ID caused the models validation
  test to report it as missing and prevented requests from routing correctly.

## 0.6.2

### Patch Changes

- 1b208ed: Add GLM-5.2 model (ZhipuAI, 1M context, reasoning with reasoning_effort)

## 0.6.1

### Patch Changes

- 1dece73: Mark Kimi K2.7 Code as thinking-only by setting `off` to `null` in its `thinkingLevelMap`.

## 0.6.0

### Minor Changes

- 64a0791: Add a setting for showing legacy Neuralwatt model IDs. Legacy IDs now default to disabled, and existing config files are migrated with a notice pointing users to `/neuralwatt:settings`.

### Patch Changes

- 2d60a83: Add Kimi K2.7 Code model

## 0.5.3

### Patch Changes

- c68086f: Update Neuralwatt model metadata and keep legacy quantized model IDs as temporary aliases.

## 0.5.2

### Patch Changes

- 30805b8: Add Devstral tool-result role ordering compatibility.

## 0.5.1

### Patch Changes

- 41f28c5: Update the Neuralwatt provider API key configuration for Pi 0.77.0 env interpolation rules.
- 575a9e3: Update Pi package metadata and local type-checking dependencies for Pi 0.77.0.

## 0.5.0

### Minor Changes

- 3c467b3: Remove live model sync from provider endpoint. Models are now purely hardcoded in `src/extensions/provider/models.ts` and validated against the Neuralwatt `/v1/models` API at test time.

  Removed:

  - `src/lib/fetch-models.ts` (live model fetch + `mapApiModel`)
  - `src/utils/is-offline.ts` and its test (only used by fetch flow)
  - `src/extensions/provider/provider-payload.ts` (`buildModelsPayload` wrapper)
  - `NeuralwattModelConfig` type extension (uses `ProviderModelConfig` directly)
  - `fast` field on model entries
  - Live re-registration on `session_start`

  Simplified:

  - `NEURALWATT_MODELS_CACHE` → `NEURALWATT_MODELS`
  - Provider registers once on startup with hardcoded list
  - Tests now fetch live API and compare prices, context windows, reasoning, vision, and model existence

### Patch Changes

- c10a189: Add `requiresReasoningContentOnAssistantMessages` compat flag for reasoning models. Neuralwatt docs confirm these models need `reasoning_content` on replayed assistant turns to preserve chain-of-thought across turns in agentic conversations.

## 0.4.2

### Patch Changes

- 391bac0: Update Qwen3.6 model pricing from live Neuralwatt metadata.

## 0.4.1

### Patch Changes

- 023320c: Update contextWindow values to match live API max_model_len for all 14 models

## 0.4.0

### Minor Changes

- 2b6e1ec: Migrate Pi core package dependencies from `@mariozechner/*` to `@earendil-works/*` namespace.

  - `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent` 0.74.0
  - `@mariozechner/pi-tui` → `@earendil-works/pi-tui` 0.74.0
  - `@aliou/pi-utils-settings` bumped to `^0.15.0`
  - `@aliou/pi-utils-ui` bumped to `^0.4.0`

### Patch Changes

- 85389e7: Normalize Neuralwatt context overflow errors so Pi can trigger native auto-compaction and retry.

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
