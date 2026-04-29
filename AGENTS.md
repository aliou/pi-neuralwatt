# pi-neuralwatt

Pi extension providing a Neuralwatt inference API provider.

## Purpose

Registers a `neuralwatt` provider with Pi that connects to [Neuralwatt Cloud](https://api.neuralwatt.com/v1), an OpenAI-compatible inference API with energy transparency. Models are hardcoded in `src/extensions/provider/models.ts` as a cache and also fetched live from `/v1/models` on session start. The live fetch re-registers the provider with up-to-date model data (including pricing, capabilities, and limits from the API metadata).

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format code
- `pnpm test` - Run model sync test (compares hardcoded models against live API)
- `pnpm changeset` - Create changeset for versioning

## Structure

```
src/
  config.ts                             # Config schema, settings registration, extension events
  lib/
    env.ts                              # API key resolution (auth.json -> env var)
    fetch-models.ts                     # Fetch + map models from /v1/models API
  extensions/
    provider/
      index.ts                          # Provider + settings + quota store (always loaded)
      models.ts                         # Hardcoded model cache (fallback)
      models.test.ts                    # Test: compares cache against live API + unit tests for mapApiModel
    command-quotas/
      index.ts                          # Extension entry (checks config, registers command)
      command.ts                        # /neuralwatt:quota command handler
      components/
        quotas-display.ts               # TUI component (tabs, input)
        quota-tabs.ts                   # Tab rendering (subscription, credits, usage & key)
    quota-warnings/
      index.ts                          # Extension entry (checks config, listens for events)
      notifier.ts                       # Low quota / overage warning logic
    sub-bar-integration/
      index.ts                          # Extension entry (checks config, sub-bar + status bar)
      snapshot.ts                       # Usage snapshot builder
  types/
    quota-api.ts                        # /v1/quota response types
    quota-events.ts                     # Event constants, header parsing, result types
  utils/
    quotas.ts                           # Fetch quota from /v1/quota API
    quota-format.ts                     # USD, kWh, token number formatters
    quota-bar.ts                        # Progress bar renderer, severity, percent calc
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
- **Quota command** (`quotaCommand`) - Show/hide `/neuralwatt:quota` command
- **Quota warnings** (`quotaWarnings`) - Enable/disable low quota notifications
- **Sub-bar integration** (`subBarIntegration`) - Show/hide usage in status bar

The provider itself cannot be disabled. Settings can also be changed via `pi config`.

## Model loading

The provider registers twice:

1. **Immediately on startup** with `NEURALWATT_MODELS_CACHE` (hardcoded definitions) so models are available without network.
2. **On `session_start`** it fetches `/v1/models` and re-registers the provider with live data. If the fetch fails, the hardcoded cache remains active.

Live model data includes pricing, capabilities (reasoning, vision, reasoning_effort), and limits from the API `metadata` field. See `src/lib/fetch-models.ts` for the mapping logic.

## Updating Models

1. Run `pnpm test` -- it fetches `/v1/models` and compares against hardcoded cache, also validates metadata fields
2. Fix any discrepancies (missing models, changed context windows, pricing, capabilities)
3. Re-run `pnpm test` to confirm
