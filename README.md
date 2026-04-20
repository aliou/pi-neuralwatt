![banner](https://assets.aliou.me/pi-extensions/banners/pi-neuralwatt.png)

# Pi Neuralwatt Extension

A Pi extension that adds [Neuralwatt](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF) as a model provider, giving you access to open-source models through an OpenAI-compatible API with energy transparency.

## Installation

### Get API Key

Sign up at [neuralwatt.com](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF) to get an API key.

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
pi -e ./src/extensions/provider/index.ts
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

Configure features via `/neuralwatt:settings` or `pi config`:

```
/neuralwatt:settings
```

Available settings:
- **Quota command** (`quotaCommand`) — Show/hide `/neuralwatt:quota`
- **Quota warnings** (`quotaWarnings`) — Enable/disable low quota notifications
- **Sub-bar integration** (`subBarIntegration`) — Show/hide usage in status bar

The provider itself cannot be disabled — it is always loaded.

## Disabling Features

Each feature is a separate Pi extension. You can disable individual features using `pi config`:

```
pi config extensions.disabled add @aliou/pi-neuralwatt/quota-warnings
```

This prevents the quota-warnings extension from loading while keeping the rest active. Replace `quota-warnings` with `command-quotas` or `sub-bar-integration` to disable other features.

## Adding or Updating Models

Models are hardcoded in `src/extensions/provider/models.ts` and validated against the live API. To update:

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

- Pi coding agent v0.67.68+
- Neuralwatt API key (configured in `~/.pi/agent/auth.json` or via `NEURALWATT_API_KEY`)

## Links

- [Neuralwatt](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF)
- [Neuralwatt API Docs](https://neuralwatt.com/docs)
- [Pi Documentation](https://buildwithpi.ai/)
