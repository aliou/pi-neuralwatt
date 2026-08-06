![banner](https://assets.aliou.me/github/aliou/pi-neuralwatt/banner.png)

# Pi Neuralwatt Extension

A Pi extension that adds [Neuralwatt](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF) as a model provider, giving you access to open-source models through an OpenAI-compatible API with energy transparency.

## Installation

### Get API Key

Sign up [here](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF) to get an API key (referral link).

### Configure Credentials

The extension uses Pi's credential storage. Add your API key to `~/.pi/agent/auth.json` (recommended):

```json
{
  "neuralwatt": { "type": "api_key", "key": "your-api-key-here" }
}
```

Or set environment variable:

```bash
export NEURALWATT_API_KEY="your-api-key-here"
```

### Install Extension

```bash
# From npm
pi install npm:@aliou/pi-neuralwatt

# From git
pi install git:github.com/aliou/pi-neuralwatt

# Local development
pi -e ./extensions/provider/index.ts
```

## Usage

Once installed, select `neuralwatt` as your provider and choose from available models:

```
/model neuralwatt meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8
```

### Quota Command

Check your API usage at a glance:

```
/neuralwatt:quota
```

The quota command shows three tabs:
- **Subscription** (when subscribed) — plan details, energy quota with progress bar, billing period
- **Credits** — credit balance with progress bar, accounting method
- **Usage & Key** — monthly usage (cost, requests, tokens, energy), API key info, key allowance, rate limits

https://github.com/user-attachments/assets/a8994940-c467-4744-a0f2-833cb63923ff

### Quota Warnings

When enabled, the extension notifies you when credits or energy are running low. When you have an active subscription, only energy warnings fire (credits are on-demand top-up only). Warnings use escalation on severity transitions and have a cooldown for `warning` level.

### Sub-bar Integration

When a Neuralwatt model is active, the footer status bar shows live quota usage (credits and energy). The status updates after each response and on session start.

## Settings

Configure features with `/neuralwatt:settings`:

- **Quota command** — Show/hide `/neuralwatt:quota`
- **Quota warnings** — Enable/disable low quota notifications
- **Sub-bar integration** — Show/hide usage in status bar
- **Legacy model IDs** — Include deprecated model aliases
- **Alias model IDs** — Include active creator-scoped model aliases
- **Early access models** — Include pre-release models available only to the configured API key

The provider itself cannot be disabled — it is always loaded.

Configuration uses nested per-feature sections. Existing flat config files are migrated automatically, with a backup written next to the migrated config.

### Model Refresh

Neuralwatt registers its public models without network access. When early-access models are enabled, opening `/model` refreshes the authenticated catalog in the background. `pi update --models` forces an immediate refresh.

Pi stores the complete effective Neuralwatt catalog in `~/.pi/agent/models-store.json` for offline startup. Current hardcoded public and legacy definitions remain authoritative when cached models are restored.

## Adding or Updating Models

Public models are hardcoded in `extensions/provider/models/public-models.ts` and validated against the live API. To update:

1. Run `pnpm test` — it fetches `/v1/models` and compares against hardcoded definitions
2. Fix any discrepancies (missing models, changed context windows)
3. Re-run `pnpm test` to confirm

## Development

### Setup

```bash
git clone https://github.com/aliou/pi-neuralwatt.git
cd pi-neuralwatt

# Install dependencies (sets up pre-commit hooks)
pnpm install && pnpm prepare
```

Pre-commit hooks run on every commit:
- TypeScript type checking
- Biome linting
- Biome formatting with auto-fix

### Commands

```bash
# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format

# Test
pnpm run test
```

## Release

This repository uses [Changesets](https://github.com/changesets/changesets) for versioning.

## Requirements

- Pi coding agent v0.80.8+
- Neuralwatt API key (configured in `~/.pi/agent/auth.json` or via `NEURALWATT_API_KEY`)

## Links

- [Neuralwatt](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF)
- [Neuralwatt API Docs](https://neuralwatt.com/docs)
- [Pi Documentation](https://buildwithpi.ai/)
