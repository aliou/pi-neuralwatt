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
      public-models.ts                  # Hardcoded public model definitions
      legacy.ts                         # Phased-out model ID aliases
      hidden.ts                         # Hidden-model discovery from authenticated /v1/models
      cache.ts                          # Stale-while-revalidate disk cache for hidden models
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

When a subscription is active, energy is the primary billing method. Credits are on-demand top-up only. The quota warnings system respects this: it only warns about credits when there is no active subscription. When subscribed, only energy warnings are shown.

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
- **Hidden models** (`provider.includeHiddenModels`) - Include authenticated hidden models

The provider itself cannot be disabled. Settings can also be changed via `pi config`. Existing flat config files are migrated to the nested shape automatically.

## Model loading

The provider registers on startup with `NEURALWATT_MODELS` (hardcoded definitions) so models are available without network. Models must be updated manually in `extensions/provider/models/public-models.ts` when the Neuralwatt API adds or changes models.

### Hidden models (stale-while-revalidate)

Some Neuralwatt models are accessible via the authenticated API key but not part of the unadvertised public list (e.g. `glm-5.2-short`). Enabling the `provider.includeHiddenModels` setting makes them available.

Discovery requires the API key, which Pi only exposes inside `session_start` (`ctx.modelRegistry.authStorage`). Pi validates scoped models during startup, *before* `session_start`, so a naive in-place fetch would warn `No models match pattern "neuralwatt/glm-5.2-short"` on saved scoped models every launch.

To work around this, the provider factory uses stale-while-revalidate:

1. At extension load (synchronous): read `${getAgentDir()}/cache/neuralwatt-hidden-models.json` and register the provider with the cached hidden models immediately. Zero latency. Pi's startup scoped-model validation sees them.
2. On `session_start`: refetch `/v1/models`, write the result to the cache, and re-register the provider so the live list wins. The fetch is cancellable via an `AbortController` aborted on `session_shutdown`.

First launch with no cache still warns once until `session_start` writes the cache. Subsequent launches resolve cleanly.

## Updating Models

1. Check the Neuralwatt API (`https://api.neuralwatt.com/v1/models`) for current model list
2. Compare against hardcoded definitions in `extensions/provider/models/public-models.ts`
3. Add missing models, update changed fields (context windows, pricing, capabilities)
4. Run `pnpm test` to validate
