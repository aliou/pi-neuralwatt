---
name: neuralwatt-models
description: Update model metadata for the pi-neuralwatt extension. Use when adding or refreshing entries in extensions/provider/models/public-models.ts, checking Neuralwatt model availability, or syncing hardcoded models with the live Neuralwatt API.
---

# Update Neuralwatt models

Update `extensions/provider/models/public-models.ts` from live Neuralwatt data, not guesswork.

## Default behavior

Take initiative.

Do not start by asking which model to update. First detect drift, then update whatever needs updating:

1. Fetch live model data from `https://api.neuralwatt.com/v1/models`.
2. Read the current hardcoded definitions in `extensions/provider/models/public-models.ts`.
3. Check Neuralwatt portal pages for pricing and capabilities when model additions or pricing/capability changes are needed.
4. Reconcile the differences.
5. Edit `extensions/provider/models/public-models.ts`.
6. Run the relevant tests.
7. Create a changeset when model metadata changed.
8. Commit only the relevant files.

Only ask the user if there is a real blocker, such as an unreachable source, missing credentials for runtime validation, or conflicting evidence you cannot resolve.

Do not push.

## Sources of truth

Use these in order:

1. Neuralwatt models endpoint: `https://api.neuralwatt.com/v1/models`
2. Existing test failures from `extensions/provider/models.test.ts`
3. Neuralwatt portal pages:
   - `https://portal.neuralwatt.com/models`
   - `https://portal.neuralwatt.com/pricing`
4. Neuralwatt runtime behavior via direct `chat/completions` calls when needed
5. Existing hardcoded definitions for fields the live sources do not expose

## Required workflow

### 1) Inspect current definitions

Read:

- `extensions/provider/models/public-models.ts`
- `extensions/provider/models.test.ts`

Use the current file shape and comments as the formatting baseline.

### 2) Fetch Neuralwatt endpoint data

Query the full model list, then inspect affected models.

Without an API key:

```bash
curl -s https://api.neuralwatt.com/v1/models \
  | jq '.data[] | {id, owned_by, max_model_len}'
```

With an API key, if `NEURALWATT_API_KEY` is available:

```bash
curl -s -H "Authorization: Bearer $NEURALWATT_API_KEY" https://api.neuralwatt.com/v1/models \
  | jq '.data[] | {id, owned_by, max_model_len}'
```

Useful narrow query:

```bash
curl -s https://api.neuralwatt.com/v1/models \
  | jq '.data[] | select(.id==$id) | {
      id,
      owned_by,
      max_model_len
    }' --arg id 'provider/model-id'
```

### 3) Check portal data when needed

For pricing and capabilities, check:

- `https://portal.neuralwatt.com/pricing`
- `https://portal.neuralwatt.com/models`

Use browser/page extraction if needed. Do not invent pricing, image support, reasoning support, or max output tokens from the model name alone.

## Field mapping

The `/v1/models` endpoint now returns `metadata` with pricing, capabilities, and limits. When available, map from the API:

From top-level fields:
- `id`
- `max_model_len` -> `contextWindow`
- `owned_by` -> used to detect fast variants (`owned_by === "neuralwatt"`)

From `metadata.pricing`:
- `input_per_million` -> `cost.input`
- `output_per_million` -> `cost.output`
- `cached_input_per_million` -> `cost.cacheRead`
- `cached_output_per_million` -> `cost.cacheWrite`

From `metadata.capabilities`:
- `vision` -> `input` (true = `["text", "image"]`, false = `["text"]`)
- `reasoning` -> `reasoning`
- `reasoning_effort` -> extra runtime evidence only; do not add legacy compat fields
- `developer_role` -> confirm `supportsDeveloperRole: false`

From `metadata.limits`:
- `max_output_tokens` -> `maxTokens` (null = use default 65536)

From `metadata`:
- `display_name` -> `name`
- `deprecated` -> skip model if true
- `pricing_tbd` -> skip model if true

Use portal data or existing conventions for:
- `fast` (derived from `owned_by === "neuralwatt"` or `-fast` suffix)
- comments above each model

All Neuralwatt models should keep the provider compatibility defaults already used in this repo unless live behavior proves otherwise:

```ts
compat: {
  supportsDeveloperRole: false,
  maxTokensField: "max_tokens",
}
```

Reasoning models should assign `thinkingLevelMap` at the model level and keep compat minimal. Only expose multiple Pi thinking levels when official Neuralwatt docs or runtime evidence confirms distinct level support:

```ts
thinkingLevelMap: {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: null,
},
```

When a model only has a binary or ambiguous thinking control, expose one known-good Pi thinking level:

```ts
thinkingLevelMap: {
  minimal: null,
  low: null,
  medium: "medium",
  high: null,
  xhigh: null,
},
```

## Decision rules

- Start from test failures, but update all clearly stale entries you find in the same pass.
- Add new models when the Neuralwatt endpoint exposes them and they fit the existing provider scope.
- Remove models only when they are truly gone from Neuralwatt, not because of a temporary fetch issue.
- Set `contextWindow` from `max_model_len` on the Neuralwatt endpoint.
- Keep pricing from the portal or existing pricing when the portal has not changed.
- Keep `maxTokens` from the portal, runtime evidence, or existing conventions when the API does not expose it.
- Keep `reasoning`, `input`, and `fast` from portal/runtime evidence or existing conventions when the API does not expose them.
- Do not add `compat` fields beyond current repo conventions unless live behavior requires it.
- Do not ask the user which models to update unless there is a true ambiguity you cannot resolve.

## Required runtime checks

Do not rely only on metadata for `reasoning` or multimodal support when the evidence is mixed or when adding a new model with unclear behavior.

Use the environment variable `NEURALWATT_API_KEY`. Never print it.

### Reasoning check

```bash
curl -sS https://api.neuralwatt.com/v1/chat/completions \
  -H "Authorization: Bearer $NEURALWATT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "model": "provider/model-id",
  "messages": [{"role": "user", "content": "Reply with ok"}],
  "reasoning_effort": "low",
  "max_tokens": 64
}
JSON
```

Treat `reasoning` as supported if the request succeeds and clearly accepts reasoning mode.

### Image input check

```bash
curl -sS https://api.neuralwatt.com/v1/chat/completions \
  -H "Authorization: Bearer $NEURALWATT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "model": "mistralai/Devstral-Small-2-24B-Instruct-2512",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image? Reply in 3 words max."},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR0i8AAAAASUVORK5CYII="}}
      ]
    }
  ],
  "max_tokens": 32
}
JSON
```

If Neuralwatt rejects image input, keep `input: ["text"]`.

## Changeset and commit workflow

When model metadata changed:

1. Create a changeset with `pnpm changeset` or write a valid changeset manually.
2. Use a patch bump for routine model metadata updates.
3. Re-run verification before committing:

```bash
pnpm test -- extensions/provider/models.test.ts
pnpm typecheck
pnpm lint
```

4. Check `git status`.
5. Stage only relevant files, usually:
   - `extensions/provider/models/public-models.ts`
   - `.changeset/*.md`
6. Commit with a concise conventional commit message, for example:

```bash
git commit -m "chore: update neuralwatt models"
```

Never use `git add .` or `git add -A`.

Do not push.

## Output expectations

When done, summarize:

1. Newly added models.
2. Removed models.
3. Corrected model fields, especially context windows, max tokens, pricing, reasoning, or input modalities.
4. Test/check results.
5. Commit hash.

## Known repo paths

Use these exact paths in this repo:

- `extensions/provider/models/public-models.ts`
- `extensions/provider/models.test.ts`
