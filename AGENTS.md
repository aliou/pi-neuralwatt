# pi-neuralwatt

Pi extension providing a Neuralwatt inference API provider.

## Purpose

Registers a `neuralwatt` provider with Pi that connects to [Neuralwatt Cloud](https://api.neuralwatt.com/v1), an OpenAI-compatible inference API with energy transparency. Models are hardcoded in `extensions/provider/models/public-models.ts` from the `/v1/models` API (including pricing, capabilities, and limits from the `metadata` field).

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format code
- `pnpm test` - Run model validation tests
- `pnpm changeset` - Create changeset for versioning

## Structure

```
extensions/
  provider/
    index.ts                            # Provider factory: registers provider + quota store (always loaded)
    commands/settings/index.ts          # /neuralwatt:settings command
    models/
      index.ts                          # Re-exports + getNeuralwattModels helper
      build.ts                          # Shared model builder (compat defaults, maxTokens rule)
      public-models.ts                  # Public model family/variant table
      legacy.ts                         # Phased-out model ID aliases
      early-access.ts                   # Early-access model discovery from authenticated /v1/models
      refresh.ts                        # Pi-managed dynamic catalog refresh and cache
  command-quotas/
    index.ts                            # Extension entry (checks config, registers command)
    command.ts                          # /neuralwatt:quota command handler
    components/
      quotas-display.ts                 # TUI component (tabs, input)
      quota-tabs.ts                     # Tab rendering (subscription, credits, usage & key)
      progress-bar.ts                   # TUI progress bar renderer
  quota-warnings/
    index.ts                            # Extension entry (checks config, listens for events)
    notifier.ts                         # Low quota / overage warning logic
  sub-bar-integration/
    index.ts                            # Extension entry (checks config, sub-bar + status bar)
    snapshot.ts                         # Usage snapshot builder
  _shared/
    auth.ts                             # API key resolution (auth.json -> env var)
src/
  config/
    types.ts                            # Config schema types
    defaults.ts                         # Default resolved config
    loader.ts                           # ConfigLoader setup
    migration/index.ts                  # Config migrations
  events.ts                             # Extension event constants, payloads, header parsing
  lib/
    neuralwatt-api.ts                   # Neuralwatt API helpers
  types/
    models-api.ts                       # /v1/models response types
    quota-api.ts                        # /v1/quota response types
    quota-result.ts                     # Quota fetch result types
  utils/
    quota-format.ts                     # USD, kWh, token number formatters
    quota-bar.ts                        # Quota severity and percent helpers
.agents/skills/
  neuralwatt-models/
    SKILL.md                            # Skill for retrieving/updating model list (dev only)
```

## Extension loading

Each extension in `pi.extensions` is loaded independently by Pi. They all call `await configLoader.load()` at startup (idempotent). The provider extension is always loaded and registers settings. Feature extensions check config at startup and listen for `neuralwatt:config:updated` events to toggle behavior at runtime.

Extensions self-register via `neuralwatt:extensions:register` events when the provider requests them (`neuralwatt:extensions:request`). This lets the settings UI show which features are actually loaded.

## Provider Configuration

- Provider name: `neuralwatt`
- Base URL: `https://api.neuralwatt.com/v1`
- API: `openai-completions`
- Auth: `auth.json` entry for "neuralwatt", fallback to `NEURALWATT_API_KEY` env var
- All models use `maxTokensField: "max_tokens"` and `supportsDeveloperRole: false`

## Quota Tracking

Two sources of quota data:

1. **Response headers** - `after_provider_response` event captures `x-allowance-remaining-usd`, `x-budget-remaining-usd`, `x-request-cost-usd`, `x-cache-savings-usd`, `x-subscription-plan`, `x-energy-included`, `x-energy-remaining`, `x-energy-used` from every Neuralwatt response. Emitted as `neuralwatt:quotas:updated` events (throttled to 5s).

2. **API fetch** - `/v1/quota` endpoint returns full balance, usage, limits, and subscription info. Used for the `/neuralwatt:quota` command and initial session fetch.

### Subscription vs credits

When a subscription is active, energy (kWh) is the primary billing method. Credits are on-demand top-up only. The quota warnings progress through the billing stages, each with its own alert key so a later stage suppresses the earlier one instead of re-reporting a depleted pool:

- Subscribed, not in overage — warn on subscription energy (kWh remaining).
- Subscribed, in overage with an overage cap — warn about overage cap progress. Overage cost is derived from kWh usage (`kwh_used - kwh_included`) at the subscribed rate of $5/kWh; remaining cap and % are computed against `limits.overage_limit_usd`. `subscription.in_overage` is a pure on/off flag with no spent counter, so progress is computed rather than read from the API. Credits are not warned here because a cap means they are never reached.
- Subscribed, in overage with no cap — warn on balance credits (overage draws down the balance directly at $5/kWh).
- No subscription with an overage cap — warn on overage cap progress. All kWh are billable at the unsubscribed rate of $10/kWh, computed from `usage.current_month.energy_kwh`.
- No subscription with no cap — warn on credits.

Usage totals (monthly/lifetime cost in USD) are deliberately not used as a threshold basis — they are not directly tied to the subscription's kWh quota.

### Quota tabs

- **Subscription** — plan details, energy quota with progress bar, billing period. Only shown when subscribed.
- **Credits** — credit balance with progress bar, accounting method.
- **Usage & Key** — monthly usage (cost, requests, tokens, energy), API key info, key allowance, rate limits. Always shown.

## Settings

`/neuralwatt:settings` allows toggling:
- **Quota command** (`quotaCommand.enabled`) - Show/hide `/neuralwatt:quota` command
- **Quota warnings** (`quotaWarnings.enabled`) - Enable/disable low quota notifications
- **Sub-bar integration** (`subBarIntegration.enabled`) - Show/hide usage in status bar
- **Legacy model IDs** (`provider.includeLegacyModelIds`) - Include deprecated model aliases
- **Hidden models** (`provider.includeHiddenModels`) - Include hidden models

The provider itself cannot be disabled. Settings can also be changed via `pi config`. Existing flat config files are migrated to the nested shape automatically.

## Model loading

The provider registers on startup with `NEURALWATT_MODELS` (hardcoded definitions) so models are available without network. Models must be updated manually in `extensions/provider/models/public-models.ts` when the Neuralwatt API adds or changes models.

Public models are declared as a family/variant table. A family holds the defaults its variants share (pricing, modalities, `thinkingLevelMap`); each variant declares its id, name, context window, `maxOutputTokens`, and `reasoning`, plus any override.

Variants combine independent modifiers, not a fixed list: `-short` (smaller context, bounded output), `-fast` (reasoning disabled), and `-flex` (Flex tier). GLM-5.2 alone ships `glm-5.2`, `-fast`, `-flex`, `-short`, `-short-fast`, `-short-flex`, and `-short-fast-flex`. A variant may differ from its family in more than limits: override `cost` for a variant priced differently, or set `costMultiplier` for a proportional change such as the Flex discount.

`buildNeuralwattModel` in `build.ts` applies the compat defaults and the limit rule `maxTokens = metadata.limits.max_output_tokens ?? max_model_len`; hidden model discovery uses the same builder. `extensions/provider/models.test.ts` diffs the definitions against the live catalog and skips when the API is unreachable.

### Flex variants

`-flex` models are the [Flex tier](https://portal.neuralwatt.com/docs/guides/flex-tier): same model, limits, and prompt cache as the standard variant, but admitted when there is spare capacity. They are billed at 65% of standard (35% off), applied through `costMultiplier` on the variant. The discount only applies to streaming requests; a non-streaming request to a `-flex` model falls back to the standard tier and standard price, and reports `service_tier: "standard"`. Flex models are not in the public `/v1/models` response, so the drift test skips them.

### Hidden models

Some Neuralwatt models are pre-release: reachable with an authenticated API key but not yet part of the public `/v1/models` list. They are not secret, and most go public eventually. Enabling the `provider.includeHiddenModels` setting makes them available.

The setting was called `provider.includeHiddenModels` before 0.11. Migration `03-rename-hidden-to-early-access` rewrites it on load.

The config loader reads the file, runs migrations, and hands the rest of the code the current `NeuralwattConfig` shape only. Each migration declares the superseded shape it needs inside its own file. Do not widen loader, settings, or extension types to accept old shapes.

The provider implements Pi's `refreshModels(context)` API. Pi supplies the resolved credential, abort signal, network policy, and provider-scoped model store. Opening `/model` refreshes the catalog in the background; `pi update --models` forces a refresh.

The refresh flow is:

1. Register hardcoded public models and configured legacy aliases synchronously.
2. During offline startup, restore dynamic hidden models from Pi's provider-scoped cache.
3. During network refresh, fetch authenticated `/v1/models`, combine hidden models with current public and legacy definitions, and persist the complete effective catalog through `context.store`.
4. Preserve the stale catalog when a network refresh fails. A successful empty result purges removed hidden models.

Pi stores the catalog in `${getAgentDir()}/models-store.json`. Public and legacy definitions in source remain authoritative over cached copies.

## Updating Models

1. Check the Neuralwatt API (`https://api.neuralwatt.com/v1/models`) for current model list
2. Compare against hardcoded definitions in `extensions/provider/models/public-models.ts`
3. Add missing models to the matching family, update changed fields (context windows, pricing, capabilities)
4. Run `pnpm test` to validate
