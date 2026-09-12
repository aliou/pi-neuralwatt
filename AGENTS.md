# pi-neuralwatt

Pi extension providing a Neuralwatt inference API provider.

## Purpose

Registers a `neuralwatt` provider with Pi that connects to [Neuralwatt Cloud](https://api.neuralwatt.com/v1), an OpenAI-compatible inference API with energy transparency. The model catalog is built at runtime from the `/v1/models` API response; a hardcoded fallback in `extensions/provider/models/public-models.ts` covers offline first start.

## Stack

- TypeScript (strict mode), pnpm, Biome, Changesets

## Scripts

- `pnpm typecheck` - Type check
- `pnpm lint` - Lint
- `pnpm format` - Format code
- `pnpm test` - Run deterministic tests (invariants, derivation, unit tests)
- `pnpm check:models` - Compare the offline fallback table against the live API
- `pnpm changeset` - Create changeset for versioning

## Structure

```
extensions/
  provider/
    index.ts                            # Provider extension entry point; registers the provider + quota flows (always loaded)
    provider.ts                         # pi-ai Provider assembly: auth resolution, refresh; delegates everything API-specific to api/
    provider.test.ts                    # Provider tests (auth resolution, catalog swap, api delegation)
    constants.ts                        # Provider id, base URL, env var name, request headers
    api/
      types.ts                          # NeuralwattApiHandler interface (stampModels / stream / streamSimple)
      openai-completions.ts             # Default surface: chat/completions stamping + stream delegation
      anthropic-messages.ts             # /v1/messages surface: stamping, adaptive-thinking compat, reasoning payload mapper
      anthropic-messages.test.ts        # Stamping + mapper tests
    commands/settings/index.ts          # /neuralwatt:settings command
    models/
      index.ts                          # Re-exports
      catalog.ts                        # API-driven catalog builder + overrides (flex pricing, chat-template compat)
      build.ts                          # Shared model builder utilities (thinkingLevelMap identity + anthropic alias-resolving, flex multiplier, maxTokens)
      public-models.ts                  # Offline fallback model table (first start without network)
      refresh.ts                        # TTL-based model refresh (fetch → build → persist | failure → fallback)
      refresh.test.ts                   # Refresh tests (anonymous key, placeholder key, TTL, abort, failure)
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
    migration/index.ts                  # Config migrations (each typed against its own historical shape)
  events.ts                             # Extension event constants, payloads, header parsing
  lib/
    neuralwatt-api.ts                   # Neuralwatt API helpers (anonymous-safe auth)
  types/
    models-api.ts                       # /v1/models response types
    quota-api.ts                        # /v1/quota response types
    quota-result.ts                     # Quota fetch result types
  utils/
    quota-format.ts                     # USD, kWh, token number formatters
    quota-bar.ts                        # Quota severity and percent helpers
.agents/skills/
  neuralwatt-models/
    SKILL.md                            # Skill for updating the static fallback model list (dev only)
```

## Extension loading

Each extension in `pi.extensions` is loaded independently by Pi. They all call `await configLoader.load()` at startup (idempotent). The provider extension is always loaded and registers settings. Feature extensions check config at startup and listen for `neuralwatt:config:updated` events to toggle behavior at runtime.

Extensions self-register via `neuralwatt:extensions:register` events when the provider requests them (`neuralwatt:extensions:request`). This lets the settings UI show which features are actually loaded.

## Provider Configuration

- Provider name: `neuralwatt`
- Base URL: `https://api.neuralwatt.com/v1` on the chat-completions surface; the anthropic surface stamps models with the origin root because the Anthropic SDK appends `/v1/messages` itself
- API surface: user-selected via the `provider.api` setting (`openai-completions` default, or `anthropic-messages`); exactly one surface is active at a time and the provider re-stamps the catalog with it on every `getModels()`
- Auth: the provider owns its standalone auth on the registered pi-ai `Provider`: `resolve` reads the stored credential first, then the `NEURALWATT_API_KEY` env var, and never fails — without a key it resolves to an anonymous empty key so catalog refresh succeeds. `check` stays strict: without a real key the provider reports unconfigured and its models stay hidden from `/model`
- All models use `maxTokensField: "max_tokens"` and `supportsDeveloperRole: false`

## Quota Tracking

Two sources of quota data:

1. **Response headers** - `after_provider_response` event captures `x-allowance-remaining-usd`, `x-budget-remaining-usd`, `x-request-cost-usd`, `x-cache-savings-usd`, `x-subscription-plan`, `x-energy-included`, `x-energy-remaining`, `x-energy-used` from every Neuralwatt chat-completions response. Emitted as `neuralwatt:quotas:updated` events (throttled to 5s). The `/v1/messages` surface sends no quota headers; there, updates come from SSE `: energy`/`: cost` stream comments (captured by the stream tee) and `/v1/quota` polling.

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
- **API surface** (`provider.api`) - Choose between `openai-completions` (default) and `anthropic-messages` (`POST /v1/messages`, vLLM-backed)
- **Quota command** (`quotaCommand.enabled`) - Show/hide `/neuralwatt:quota` command
- **Quota warnings** (`quotaWarnings.enabled`) - Enable/disable low quota notifications
- **Sub-bar integration** (`subBarIntegration.enabled`) - Show/hide usage in status bar

The provider itself cannot be disabled. Settings can also be changed via `pi config`. Existing flat config files are migrated to the nested shape automatically.

## Model catalog

The catalog is built from `/v1/models` at runtime by `extensions/provider/models/catalog.ts`. `NEURALWATT_MODELS` in `public-models.ts` is the offline fallback for first start only.

`catalog.ts` applies small per-model overrides: flex pricing (0.65x) and chat-template compat for Qwen3.8. See `.agents/skills/neuralwatt-models/SKILL.md` for keeping the fallback in sync.

When `provider.api` is `anthropic-messages`, the same canonical catalog is stamped at read time by `api/anthropic-messages.ts` (origin-root baseUrl because the Anthropic SDK appends `/v1/messages` itself, `forceAdaptiveThinking` compat, thinking map built by `buildAnthropicThinkingLevelMap` from the reasoning contract's `supported_efforts` + `effort_aliases`; aliases are needed here because vLLM's effort enum accepts only native values). Reasoning off is expressed as `chat_template_kwargs.enable_thinking=false` by that module's payload injector, because the vLLM-backed endpoint accepts but ignores `thinking:{type:"disabled"}`. The api is resolved once at extension load; `/neuralwatt:settings` tells the user to run `/reload` after changing it.

Drift between the fallback and the live API is a non-blocking, notify-me concern (the runtime syncs from the API). `scripts/check-models.ts` (`pnpm check:models`) compares them and exits 1 with a markdown report on drift; the `model-sync` workflow runs it twice daily and opens a `model-sync` issue. The deterministic invariant, derivation, and unit tests in `models.test.ts` stay in the blocking CI suite.

### Tests vs drift check

`extensions/provider/models.test.ts` holds only deterministic tests against the local fallback data: invariants (unique IDs, `maxTokens <= contextWindow`, required fields, no `thinkingLevelMap` holes), flex derivation/pricing, `thinkingLevelMap` derivation, and `buildThinkingLevelMap` unit tests. The live-API comparison lives in `scripts/check-models.ts`, not the test suite, so upstream changes never break PR CI.

### Config migrations

Four migrations handle config schema evolution (flat → nested). Each is typed against its own historical input shape. The `NeuralwattConfig` type does not declare a `provider` key; migrations still write `provider` fields for on-disk backward compatibility but nothing reads them.
