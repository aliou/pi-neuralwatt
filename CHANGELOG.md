# @aliou/pi-extension-template

## 0.13.0

### Minor Changes

- d58a55f: Derive reasoning levels from the endpoint's `supported_efforts`.

  `thinkingLevelMap` is now built by identity from each model's
  `metadata.reasoning.supported_efforts` (plus `mandatory`) via a single
  `buildThinkingLevelMap` helper, instead of hand-tuned per-family constants.
  Early-access models read the live `metadata.reasoning` block through the same
  helper. `default_effort` and `effort_aliases` are no longer consumed.

  Behavior changes for the public catalog:

  - DeepSeek V4 Flash: `low` is no longer exposed (the API aliases it to `high`;
    identity mapping drops it).
  - Kimi K3: `off` is now exposed (`mandatory: false` upstream).
  - Kimi K2.7 Code: high-only fallback map, unchanged in effect.

## 0.12.1

### Patch Changes

- b1547c9: Sync hardcoded model metadata with the live Neuralwatt catalog:

  - `gemma-4-31b` is now a reasoning model. Its chat template takes a boolean
    rather than a graded effort, so it exposes a single Pi thinking level at
    `max` (the model's only depth, since every non-`none` value resolves to
    `max`). It does not reason by default but produces reasoning traces when
    asked.
  - `glm-5.2-fast`, `glm-5.2-short-fast`, and `glm-5.2-short-fast-flex` are now
    reasoning models. The `-fast` pin disables thinking by default but keeps the
    parent's full `high`/`max`/`none` contract, so sending `reasoning_effort`
    re-enables thinking for that request. They now inherit the family's
    `thinkingLevelMap`; `kimi-k3-fast` stays non-reasoning because its pin
    survives the effort parameter.
  - Add the `kimi-k3-flex` Flex variant, billed at the 65% Flex multiplier.

## 0.12.0

### Minor Changes

- fbd1b1c: Adopt `@aliou/pi-utils-settings` 0.19.1 versioned migrations.

  Bumps the dependency and adds semver `version` strings to all config migrations, leaving their content-based `shouldRun` gates intact. Switches schema generation to `pi-settings-schema`.

- 32ba87a: Add an `X-NW-Conversation-ID` header (set to the active Pi session id) to every Neuralwatt request so the gateway can correlate requests within a session.

## 0.11.4

### Patch Changes

- fcec3d3: Correct two model-catalog drifts found by the live API diff test.

  - `kimi-k2.7-code-fast` now declares `reasoning: true`. K2.7 Code cannot disable thinking; the `-fast` variant caps the reasoning budget (~64 tokens) rather than turning it off. Confirmed at runtime: the response includes populated `reasoning_content`. The variant inherits the family's binary thinking map (`high: "high"`, `off: null`).
  - Add `deepseek-v4-flash-flex`, the Flex-tier variant of DeepSeek V4 Flash. Same model, context window (1,048,560), output cap (65,536), and pricing as standard, declared with `costMultiplier: FLEX_COST_MULTIPLIER` for the 35% streaming discount. Runtime request confirmed.

  No cost changes: authenticated catalog prices match the hardcoded definitions for all models.

## 0.11.3

### Patch Changes

- 07eba55: Add Pi coding-agent 0.84 compatibility for the Neuralwatt model refresh: catalog reads and persistence now go through a runtime shape-detection shim (`src/refresh-store-compat.ts`) that uses the 0.84 `context.stored` snapshot and `context.publish({ persist })` transaction when available, and falls back to the legacy `context.store` read/write on older hosts. Early-access behavior is unchanged: the baseline catalog is persisted and returned when early access is off, cached early-access models merge with the static config when offline, and the full effective catalog persists after a successful network refresh. Abort handling is preserved. The `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui` peer ranges keep their existing floors and now also support 0.84.

## 0.11.2

### Patch Changes

- b6aabd5: Sync the model lineup with the latest Neuralwatt changes.

  - **Kimi K3 is now public**: graduated from early-access to the public catalog
    (still in preview with limited concurrency). Moved from `early-access.ts`
    to `public-models.ts` with its `-fast` variant (thinking disabled shorthand).
  - **Kimi K2.6 retired** (8/3): removed from public models, added to legacy
    aliases redirecting to Kimi K2.7 Code.
  - **Qwen 3.5 retired** (8/3): removed from public models, added to legacy
    aliases redirecting to Qwen 3.6.
  - **DeepSeek V4 Flash 0731 weights**: updated comment to note the new
    checkpoint; no routing change needed (automatic).
  - **Cache pricing at 10%**: already applied in the prior sync; DeepSeek V4
    Flash remains the exception at 20% of input rate.
  - **Flex drift test fix**: the API now advertises flex variants at standard
    pricing (the 35% discount is billing-time only), so the drift test skips
    price comparisons for flex models while still checking limits and
    capabilities.

- 117d234: Fix stale `ExtensionContext` crash in `quota-warnings` after session replacement. Both `quota-warnings` and `sub-bar-integration` captured the session ctx in a module-level variable and dereferenced it inside the shared-bus `neuralwatt:quotas:updated` handler; after `newSession`/`fork`/`switchSession`/`reload`, pi invalidates captured session-bound ctx and the deref threw. The quota subscription is now session-scoped: it subscribes in `session_start` (capturing the fresh ctx in the closure) and unsubscribes in `session_shutdown`, so the handler never runs with a stale ctx.

## 0.11.1

### Patch Changes

- 96a75e8: Move the binary-thinking families (Kimi K2.6, Kimi K2.7 Code, Qwen3.5 397B,
  Qwen3.6 35B) off the placeholder `medium` level. Moonshot documents no
  `reasoning_effort` support for Kimi K2.x (thinking is a binary on/off
  toggle, always-on for K2.7 Code), and Alibaba documents no
  `reasoning_effort` field for Qwen3.5/3.6 (hybrid `enable_thinking` only).
  The shared binary-thinking map now exposes a single `high` level, which
  stands in for standard full thinking, instead of an arbitrary `medium`.
  Not yet verified against the Neuralwatt gateway (no API key available).
- 62d611e: Fix the DeepSeek V4 Flash thinking level map. The entry exposed Pi's
  `minimal` and `medium` levels mapped to `low`/`medium`, but DeepSeek
  documents V4 Flash as accepting only `low`, `high`, and `max`
  `reasoning_effort` values (default `high`) — there is no `medium` tier.
  Pi's `low`/`high`/`max` now map directly, `off` still disables thinking,
  and `minimal`/`medium`/`xhigh` are unsupported holes. Not yet verified
  against the Neuralwatt gateway (no API key available); the map follows the
  official DeepSeek V4 thinking-mode docs.
- 45e5d01: Sync model pricing with the live Neuralwatt catalog.

  Cache-read prices dropped across families (glm-5.2 0.3625 -> 0.145,
  kimi-k2.6 0.1725 -> 0.069, kimi-k2.7-code 0.2375 -> 0.095,
  qwen3.5-397b 0.1725 -> 0.069, qwen3.6-35b 0.0725 -> 0.029, gemma-4-31b
  0.036 -> 0.0144), and DeepSeek V4 Flash moved to public pricing
  (input 0.104 -> 0.14, output 0.207 -> 0.28, cacheRead 0.026 -> 0.028).

  The drift test now also recognizes creator-scoped alias IDs from
  `aliases.ts`, so the live `deepseek-ai/DeepSeek-V4-Flash` entry no longer
  fails the catalog check.

- 45791ae: Fix the `kimi-k3` thinking level map. The early-access entry inherited the
  generic "binary thinking" fallback (`medium` only), but Moonshot documents
  K3 as always-reasoning with `reasoning_effort` values `low`, `high`, and
  `max` (default `max`). Pi's `low`/`high`/`max` now map to the provider
  values, and `off`, `minimal`, `medium`, and `xhigh` are unsupported holes.
  Verified against the Neuralwatt gateway: the authenticated catalog reports
  `capabilities.reasoning_effort: true` for `kimi-k3`, and requests with
  `reasoning_effort` `low`/`high`/`max` succeed with reasoning traces.

## 0.11.0

### Minor Changes

- 4d10d48: Add a separate alias model ID setting for active creator-scoped Neuralwatt model IDs.

## 0.10.6

### Patch Changes

- c553f63: Price `-flex` models at the Flex tier discount.

  Flex variants were priced like their standard counterparts. They are billed at
  65% of standard (35% off), so cost estimates were overstated by more than a
  third. Note that the discount only applies to streaming requests: a
  non-streaming request to a `-flex` model falls back to the standard tier and the
  standard price.

- ba8d520: Correct model output limits and restructure the model catalog.

  `maxTokens` now mirrors the API rule `metadata.limits.max_output_tokens ?? max_model_len`
  instead of defaulting to 65536. This raises the output cap on `glm-5.2`,
  `glm-5.2-fast`, `glm-5.2-flex`, `kimi-k2.6{,-fast,-flex}`, `kimi-k2.7-code{,-flex}`,
  `qwen3.5-397b{,-fast}`, `qwen3.6-35b{,-fast}`, and early-access `kimi-k3`; it lowers
  `glm-5.2-short-flex` and `glm-5.2-short-fast-flex` to their real 32000 cap.

  Flex variants now cost 65% of their standard counterpart, matching the documented
  35% Flex tier discount.

  Adds `kimi-k2.7-code-fast`. Public models are now declared as a family/variant
  table built by a shared builder that early-access model discovery reuses, and the drift
  test enforces the `maxTokens` rule and skips when the API is unreachable.

- 620ce1c: Rename "hidden models" to "early access models".

  These models are not hidden, they are pre-release: Neuralwatt ships them to
  authorized accounts first and most go public later.

  `provider.includeHiddenModels` is now `provider.includeEarlyAccessModels`.
  Existing configs are rewritten on load.

## 0.10.5

### Patch Changes

- f167e39: Add Kimi K3 to the hidden catalog, move DeepSeek V4 Flash to the public catalog
  with Neuralwatt's published metadata, and retain Gemma 4 31B's former model ID
  as a legacy alias.

## 0.10.4

### Patch Changes

- 576fdde: Add the early-access DeepSeek V4 Flash model to the hidden catalog and refresh
  the public Neuralwatt model metadata.

## 0.10.3

### Patch Changes

- eb21c5c: Quota warnings now progress through the billing stages and compute overage cap progress instead of emitting a binary "in overage" alert.

  - Subscribed in overage with a cap: warn about overage cap progress, derived from (kwh_used - kwh_included) at $5/kWh. Credits are skipped because a cap means they're never reached.
  - Subscribed in overage with no cap, or cap exhausted: fall through to balance credits.
  - Unsubscribed with a cap: warn about overage cap progress, billed at $10/kWh.
  - Each stage uses its own alert key so a later stage suppresses the earlier one instead of re-reporting a depleted pool.
  - Usage totals (monthly/lifetime USD) are no longer used as a threshold basis; they're not directly tied to the subscription kWh quota.

## 0.10.2

### Patch Changes

- ad8c81b: Expose Gemma 4 31B in the public Neuralwatt model catalog.

## 0.10.1

### Patch Changes

- 935def8: Add the API-omitted Gemma 4 31B model to hidden-model discovery.

## 0.10.0

### Minor Changes

- 970c4de: Expose Pi's `max` thinking level (introduced in Pi 0.80.6) on GLM-5.2 reasoning models. GLM-5.2 natively supports `high` and `max` reasoning efforts, so Pi's `max` level now maps directly to the provider's `max` value; `xhigh` is marked as an unsupported hole between `high` and `max`. Verified `reasoning_effort: "max"` against the Neuralwatt API (glm-5.2 produces extended thinking). Peer dependency range tightened to `>=0.80.6` for the Pi core packages since the source now references the `max` thinking level.

## 0.9.0

### Minor Changes

- ad515e8: Update to Pi 0.80.8 provider authentication and refreshable model catalogs. Cache the complete Neuralwatt catalog through Pi's model store and preserve stale hidden models when refresh fails.

## 0.8.1

### Patch Changes

- a3d331b: Suppress repeated Neuralwatt quota warnings by applying the 60-minute cooldown to repeated critical warnings and throttling SSE quota emissions.

## 0.8.0

### Minor Changes

- e5e562a: Migrate Neuralwatt settings to nested per-feature configuration.

  Old flat config is migrated automatically, and a backup file is written next to the migrated config. Feature behavior is unchanged.

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
