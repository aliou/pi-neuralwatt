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
  allowances/
    index.ts                            # Extension entry (request headers, widget, warnings)
    command.ts                          # /neuralwatt:allowances command
    headers.ts                          # before_provider_headers allowance injection
    widget.ts                           # Editor-adjacent allowance widget rendering
    warnings.ts                         # Session allowance threshold warnings
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

## Allowance Tracking

The optional hidden allowance extension is configured through `/neuralwatt:allowances` (Session and Global tabs) or direct JSON config edits. It injects request/session allowance headers during `before_provider_headers`:

- `X-Session-ID`
- `X-Session-Allowance-USD`
- `X-Request-Allowance-USD`

The provider extension parses only the new allowance response headers in `after_provider_response` and emits `neuralwatt:allowances:updated`:

- `X-Session-Spent-USD`
- `X-Session-Allowance-Remaining-USD`

Allowance state is header-only. Do not add SSE/local accumulation or backward-compatible allowance header parsing.

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

Allowance settings live under `allowances` in config files and are intentionally hidden from `/neuralwatt:settings`; use `/neuralwatt:allowances` instead. The provider itself cannot be disabled. Settings can also be changed via `pi config`. Existing flat config files are migrated to the nested shape automatically.

## Model loading

The provider registers on startup with `NEURALWATT_MODELS` (hardcoded definitions) so models are available without network. Models must be updated manually in `extensions/provider/models/public-models.ts` when the Neuralwatt API adds or changes models.

### Hidden models

Some Neuralwatt models are accessible via the authenticated API key but not part of the public list. Enabling the `provider.includeHiddenModels` setting makes them available.

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
3. Add missing models, update changed fields (context windows, pricing, capabilities)
4. Run `pnpm test` to validate
