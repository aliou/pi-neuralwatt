# pi-neuralwatt

Pi extension providing a Neuralwatt inference API provider.

## Purpose

Registers a `neuralwatt` provider with Pi that connects to [Neuralwatt Cloud](https://api.neuralwatt.com/v1), an OpenAI-compatible inference API with energy transparency. The model catalog is built at runtime from the `/v1/models` API response; a hardcoded fallback in `extensions/provider/models/public-models.ts` covers offline first start.

## Structure

Three feature extensions plus shared code. `extensions/provider/` is the always-loaded provider extension (catalog building, refresh, settings); `extensions/command-quotas/` serves `/neuralwatt:quota`; `extensions/quota-warnings/` emits low-quota notifications. `src/` holds config types/loader/migrations, event constants, API types, and quota formatting/severity helpers. The offline fallback model table lives in `extensions/provider/models/public-models.ts`; `.agents/skills/neuralwatt-models/` covers keeping it in sync.

## Extension loading

Each extension in `pi.extensions` is loaded independently by Pi. They all call `await configLoader.load()` followed by `bindProjectConfig(pi, configLoader)` at startup. Setup reads global settings; project settings apply at `session_start` only when Pi trusts the project. The provider extension is always loaded and registers settings. The quota command and quota warnings read trusted-aware config at session startup and listen for `neuralwatt:config:updated` events. The quota command checks its live enabled state when invoked.

Extensions self-register via `neuralwatt:extensions:register` events when the provider requests them (`neuralwatt:extensions:request`). This lets the settings UI show which features are actually loaded.

## Provider Configuration

- Provider name: `neuralwatt`
- Base URL: `https://api.neuralwatt.com/v1`, overridable via `provider.apiBaseUrl`. The configured base drives the catalog and quota fetches and is the fallback for models that carry no `baseUrl` of their own; models.json overrides, custom providers, and proxy routing take precedence. Trailing slashes are stripped; non-http(s) values fall back to the default.
- API: `openai-completions`
- Auth: the provider owns its standalone auth on the registered pi-ai `Provider`: `resolve` reads the stored credential first, then the `NEURALWATT_API_KEY` env var, and never fails — without a key it resolves to the `-` placeholder (neutral for gateways that inject credentials server-side) so catalog refresh and classifier calls succeed. `check` stays strict: without a real key the provider reports unconfigured and its models stay hidden from `/model`
- All models use `maxTokensField: "max_tokens"` and `supportsDeveloperRole: false`

## Quota Tracking

Two sources of quota data:

1. **Response headers** - `after_provider_response` event captures `x-allowance-remaining-usd`, `x-budget-remaining-usd`, `x-request-cost-usd`, `x-cache-savings-usd`, `x-subscription-plan`, `x-energy-included`, `x-energy-remaining`, `x-energy-used` from every Neuralwatt response. Emitted as `neuralwatt:quotas:updated` events (throttled to 5s).

2. **API fetch** - `/v1/quota` endpoint returns full balance, usage, limits, and subscription info. Used for the `/neuralwatt:quota` command and initial session fetch.

### Subscription vs credits

When a subscription is active, energy (kWh) is the primary billing method. Credits are on-demand top-up only. The quota warnings progress through the billing stages, each with its own alert key so a later stage suppresses the earlier one instead of re-reporting a depleted pool:

- Subscribed, not in overage — warn on subscription energy (kWh remaining).
- Subscribed, in overage with an overage cap — warn about overage cap progress. Overage cost is derived from kWh usage (`kwh_used - kwh_included`) at a per-plan rate ($7.00–$8.50/kWh by plan and billing interval); remaining cap and % are computed against `limits.overage_limit_usd`. `subscription.in_overage` is a pure on/off flag with no spent counter, so progress is computed rather than read from the API. Credits are not warned here because a cap means they are never reached.
- Subscribed, in overage with no cap — warn on balance credits (overage draws down the balance directly at the per-plan rate).
- No subscription with an overage cap — warn on overage cap progress. All kWh are billable at the unsubscribed rate of $10/kWh, computed from `usage.current_month.energy_kwh`.
- No subscription with no cap — warn on credits.

Usage totals (monthly/lifetime cost in USD) are deliberately not used as a threshold basis — they are not directly tied to the subscription's kWh quota. Unknown plans fall back to the Standard monthly rate; the unsubscribed rate is $10/kWh.

### Quota tabs

- **Subscription** — plan details, energy quota with progress bar, billing period. Only shown when subscribed.
- **Credits** — credit balance with progress bar, accounting method.
- **Usage & Key** — monthly usage (cost, requests, tokens, energy), API key info, key allowance, rate limits. Always shown.

## Settings

`/neuralwatt:settings` allows toggling:
- **Quota command** (`quotaCommand.enabled`) - Enable/disable `/neuralwatt:quota` execution
- **Quota warnings** (`quotaWarnings.enabled`) - Enable/disable low quota notifications

The provider itself cannot be disabled. `provider.apiBaseUrl` is a free-text row that live-probes `<base>/models` before saving; empty resets to the direct upstream. Settings can also be changed via `pi config`. Existing flat config files are migrated to the nested shape automatically.

The built-in sub-bar integration was removed; it lives on as a standalone one-off gist extension (frozen, not kept up to date): test with `pi -e https://gist.github.com/aliou/9939544f3c5a4f917b0a8e5c0497cdb2`, install with `pi install https://gist.github.com/aliou/9939544f3c5a4f917b0a8e5c0497cdb2`. A config migration drops `subBarIntegration` and points users at the gist.

## Model catalog

The catalog is built from `/v1/models` at runtime by `extensions/provider/models/catalog.ts`. `NEURALWATT_MODELS` in `public-models.ts` is the offline fallback for first start only.

`catalog.ts` applies per-model overrides: chat-template compat for Qwen3.8. Flex pricing ships discounted in `/v1/models`; the fallback mirrors it via `costMultiplier: 0.65` per `-flex` variant. See `.agents/skills/neuralwatt-models/SKILL.md` for keeping the fallback in sync.

When `provider.api` is `anthropic-messages`, the same canonical catalog is stamped at read time by `api/anthropic-messages.ts` (origin-root baseUrl because the Anthropic SDK appends `/v1/messages` itself, `forceAdaptiveThinking` compat, thinking map built by `buildAnthropicThinkingLevelMap` from the reasoning contract's `supported_efforts` + `effort_aliases`; aliases are needed here because vLLM's effort enum accepts only native values). Reasoning off is expressed as `chat_template_kwargs.enable_thinking=false` by that module's payload injector, because the vLLM-backed endpoint accepts but ignores `thinking:{type:"disabled"}`. The api is resolved at extension load from global settings and re-registered at session startup if trusted project settings select a different API; `/neuralwatt:settings` tells the user to run `/reload` after changing it.

The openai-completions surface has its own payload injector in `api/openai-completions.ts` for reasoning replay: the API streams chain-of-thought in `reasoning`, pi-ai records that field name as the thinking signature and replays prior thinking under it, but the served chat templates render only `reasoning_content`, so the injector renames the field on the wire. It is a move, not a copy — the gateway prefers an empty `reasoning_content` over a populated `reasoning` when both are present.

Drift between the fallback and the live API is a non-blocking, notify-me concern (the runtime syncs from the API). `scripts/check-models.ts` (`pnpm check:models`) compares them and exits 1 with a markdown report on drift; the `model-sync` workflow runs it twice daily and opens a `model-sync` issue. The deterministic invariant, derivation, and unit tests in `models.test.ts` stay in the blocking CI suite.

### Tests vs drift check

`extensions/provider/models.test.ts` holds only deterministic tests against the local fallback data: invariants (unique IDs, `maxTokens <= contextWindow`, required fields, no `thinkingLevelMap` holes), flex pricing, `thinkingLevelMap` derivation, and `buildThinkingLevelMap` unit tests. The live-API comparison lives in `scripts/check-models.ts`, not the test suite, so upstream changes never break PR CI.

### Config migrations

Four migrations handle config schema evolution (flat → nested). Each is typed against its own historical input shape. The `NeuralwattConfig` type does not declare a `provider` key; migrations still write `provider` fields for on-disk backward compatibility but nothing reads them.
