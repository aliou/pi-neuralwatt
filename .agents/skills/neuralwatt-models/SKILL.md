---
name: neuralwatt-models
description: Retrieve available models from the Neuralwatt inference API. Use when the user asks about Neuralwatt models, wants to see what models are available, or needs model details like context windows, pricing, or capabilities.
---

# Neuralwatt Models

Retrieve and inspect available models from the Neuralwatt API.

## Usage

Run this to fetch the current model list:

```bash
curl -s https://api.neuralwatt.com/v1/models | jq '.data[] | {id, owned_by, max_model_len}'
```

If an API key is available in `NEURALWATT_API_KEY`, include it:

```bash
curl -s -H "Authorization: Bearer $NEURALWATT_API_KEY" https://api.neuralwatt.com/v1/models | jq '.data[] | {id, owned_by, max_model_len}'
```

## Model details

For pricing and capabilities, check https://portal.neuralwatt.com/pricing and https://portal.neuralwatt.com/models

## Updating hardcoded models

The extension hardcodes model definitions in `src/providers/models.ts`. When the API returns new models or changed `max_model_len` values, update that file. Then run `pnpm test` to verify.
