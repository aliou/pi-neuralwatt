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

Once installed, select `neuralwatt` as your provider and pick a model:

```
/model neuralwatt kimi-k3
```

### API surface

Neuralwatt serves every model on two APIs. Pick one in `/neuralwatt:settings` → **API** (or set `provider.api` in the extension config):

- `openai-completions` (default): the OpenAI-compatible `chat/completions` endpoint.
- `anthropic-messages`: the Anthropic-compatible `POST /v1/messages` endpoint, which streams native tool use and thinking blocks.

Both use the same model ids. The setting applies on `/reload`. Cost, energy, and quota tracking work on both.

### Quota Command

Check your API usage at a glance:

```
/neuralwatt:quota
```

The quota command shows three tabs:
- **Subscription** (when subscribed): plan details, energy quota with progress bar, billing period
- **Credits**: credit balance with progress bar, accounting method
- **Usage & Key**: monthly usage (cost, requests, tokens, energy), API key info, key allowance, rate limits

https://github.com/user-attachments/assets/a8994940-c467-4744-a0f2-833cb63923ff

### Quota Warnings

When enabled, the extension notifies you when credits or energy are running low. With an active subscription, only energy warnings fire (credits are on-demand top-up only).

## Settings

Configure features with `/neuralwatt:settings`:

- **API** — Choose between `openai-completions` (default) and `anthropic-messages`; applies on `/reload`
- **API base URL** — Send requests to a different base URL, such as a gateway; empty uses the Neuralwatt API
- **Quota command** — Show/hide `/neuralwatt:quota`
- **Quota warnings** — Enable/disable low quota notifications

The provider itself cannot be disabled — it is always loaded.

## Model list

The extension ships a built-in model list, so it works offline on first start. Pi refreshes the catalog from the Neuralwatt API in the background (authenticated when an API key is configured, so key-scoped models appear too) and caches it in `~/.pi/agent/models-store.json`. `pi update --models` forces a refresh.

## Development

```bash
git clone https://github.com/aliou/pi-neuralwatt.git
cd pi-neuralwatt
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run check:models   # compare the built-in model list with the live API
```

The pre-commit hook runs typecheck, lint, the lockfile check, and the changeset check. Releases use [Changesets](https://github.com/changesets/changesets).

## Requirements

- Pi coding agent 1.4 or later
- Neuralwatt API key (configured in `~/.pi/agent/auth.json` or via `NEURALWATT_API_KEY`)

## Links

- [Neuralwatt](https://portal.neuralwatt.com/auth/register?ref=NW-ALIOU-Q7MF)
- [Neuralwatt API Docs](https://docs.neuralwatt.com/quickstart.md)
- [Pi Documentation](https://buildwithpi.ai/)
