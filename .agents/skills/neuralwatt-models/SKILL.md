---
name: neuralwatt-models
description: Update public or early-access model metadata for the pi-neuralwatt extension. Use when adding or refreshing entries in extensions/provider/models/public-models.ts or extensions/provider/models/early-access.ts, checking Neuralwatt model availability, or syncing hardcoded models with the live Neuralwatt API.
---

# Update Neuralwatt models

Update `extensions/provider/models/public-models.ts` from live Neuralwatt data, not guesswork.

`public-models.ts` is a declarative family/variant table. Each family holds the
shared pricing, modalities, and `thinkingLevelMap`; each variant (`-fast`,
`-flex`, `-short`, ...) only declares `id`, `name`, `contextWindow`,
`maxOutputTokens`, `reasoning`, and any override. `buildNeuralwattModel` in
`extensions/provider/models/build.ts` turns those into `ProviderModelConfig`
values and is shared with early-access model discovery, so the compat defaults and the
`maxTokens` rule live in exactly one place. Add variants to the existing family
rather than copying a full model literal.

## Default behavior

Take initiative.

Do not start by asking which model to update. First detect drift, then update whatever needs updating:

1. Fetch live model data from `https://api.neuralwatt.com/v1/models`.
2. Read the current hardcoded definitions in `extensions/provider/models/public-models.ts`.
3. For each added base model, verify the active creator-scoped alias when one exists.
4. Check Neuralwatt portal pages for pricing and capabilities when model additions or pricing/capability changes are needed.
5. Reconcile the differences.
6. Edit `extensions/provider/models/public-models.ts` and `extensions/provider/models/aliases.ts` when applicable.
7. Run the relevant tests.
8. Create a changeset when model metadata changed.
9. Commit only the relevant files.

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
- `extensions/provider/models/aliases.ts`
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
      metadata: {provider: .metadata.provider, huggingface_id: .metadata.huggingface_id},
      owned_by,
      max_model_len
    }' --arg id 'provider/model-id'
```

### 3) Verify active aliases

Active creator-scoped IDs belong in `extensions/provider/models/aliases.ts`.
Deprecated IDs that point at replacement models belong in
`extensions/provider/models/legacy.ts`.

When adding a base model, inspect `metadata.huggingface_id` from the
authenticated Neuralwatt models endpoint when possible. Confirm the alias with a
minimal `chat/completions` request and require a successful response for that
exact model ID. Do not add aliases for `-short`, `-fast`, or `-flex` variants
unless Neuralwatt explicitly exposes them.

### 4) Check portal data when needed

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
- `reasoning.supported_efforts` + `reasoning.mandatory` -> the Pi `thinkingLevelMap` via `buildThinkingLevelMap` (identity, no aliasing). `reasoning.default_effort` and `reasoning.effort_aliases` are typed but not consumed: Pi has no default-reasoning field, and unsupported levels map to `null` rather than being aliased.
- `developer_role` -> confirm `supportsDeveloperRole: false`

From `metadata.limits`:
- `max_output_tokens` -> `maxTokens` (null = use `max_model_len`, i.e. the full context window; never invent a cap)

From `metadata`:
- `display_name` -> `name`
- `deprecated` -> skip model if true
- `pricing_tbd` -> skip model if true

Flex variants (`-flex`) are the same model, context window, and output cap as the
standard variant, admitted on spare capacity. They are billed at a 0.65 multiplier
(35% off) when the request streams, so declare them with
`costMultiplier: FLEX_COST_MULTIPLIER` rather than copying prices. A non-streaming
request to a `-flex` model silently falls back to standard tier and standard price.
See https://portal.neuralwatt.com/docs/guides/flex-tier.

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

Reasoning models should assign `thinkingLevelMap` at the model level and keep compat minimal. The map is **derived** from the endpoint's `metadata.reasoning.supported_efforts` via `buildThinkingLevelMap` in `extensions/provider/models/build.ts` (see below). Do not hand-write `thinkingLevelMap` literals on families or early-access overrides.

## Decision rules

- Start from test failures, but update all clearly stale entries you find in the same pass.
- Add new models when the Neuralwatt endpoint exposes them and they fit the existing provider scope.
- Remove models only when they are truly gone from Neuralwatt, not because of a temporary fetch issue.
- Set `contextWindow` from `max_model_len` on the Neuralwatt endpoint.
- Keep pricing from the portal or existing pricing when the portal has not changed.
- Set `maxTokens` to `metadata.limits.max_output_tokens ?? max_model_len`. Use `resolveMaxTokens` in `extensions/provider/models/build.ts`; do not hardcode a fallback.
- Derive `thinkingLevelMap` from `metadata.reasoning` (`supported_efforts` + `mandatory`) via `buildThinkingLevelMap`. Families snapshot those two fields as `reasoningMetadata`; early-access models read the live `metadata.reasoning` block through the same helper. When the API exposes no `reasoning` block for a reasoning model, omit `reasoningMetadata` so the helper falls back to a high-only map with `off: null`. Never hand-write `thinkingLevelMap` literals or override them per early-access model.
- Keep `reasoning`, `input`, and `fast` from portal/runtime evidence or existing conventions when the API does not expose them.
- Do not add `compat` fields beyond current repo conventions unless live behavior requires it.
- Do not ask the user which models to update unless there is a true ambiguity you cannot resolve.

## Adding early-access models

Use this workflow when a model is available only to authenticated accounts or direct inference requests.

### Choose the early-access model path

First compare these two requests using the same credential:

1. Fetch the authenticated `GET /v1/models` catalog.
2. Send a minimal `POST /v1/chat/completions` request for the candidate model ID.

Handle the result as follows:

- If the authenticated catalog includes the model, dynamic discovery in `extensions/provider/models/early-access.ts` should load it. Add an override only when Pi-specific behavior is missing or incorrect.
- If chat completions accepts the model but the authenticated catalog omits it, add a fully specified entry to `EARLY_ACCESS_NEURALWATT_MODELS` in `extensions/provider/models/early-access.ts`.
- If chat completions rejects the model, do not add it. Test likely aliases before concluding that it is unavailable.
- Never place an API-omitted model in `NEURALWATT_MODELS`. Public definitions are validated against the public catalog and are exposed regardless of `provider.includeEarlyAccessModels`.

`refreshNeuralwattModels` merges hardcoded early-access models with cached and dynamically discovered models for online and offline startup. Public and legacy baseline definitions take precedence over early-access entries. Keep hardcoded early-access IDs unique, and remove or graduate an entry when Neuralwatt starts advertising it publicly.

### Probe runtime behavior

An API-omitted model has no trustworthy catalog metadata, so verify each configured capability directly:

- Exact accepted model ID and the canonical model ID returned in the response.
- Plain text and streaming.
- System and developer roles separately.
- Tool calling and JSON mode.
- Image input with a recognizable image when claiming vision support.
- Thinking disabled and enabled, including the exact request field and whether reasoning content appears.
- Prompt caching by repeating a sufficiently long identical prefix and inspecting `usage.prompt_tokens_details.cached_tokens`.
- Context and output limits from official model documentation, portal data, or bounded runtime tests.

For binary thinking controlled through `chat_template_kwargs.enable_thinking`, use Pi's generic chat-template mapping. Reasoning levels should still be expressed as a `reasoningMetadata` snapshot so `buildThinkingLevelMap` derives the map; do not hand-write `thinkingLevelMap` literals. For a binary-thinking model with no `supported_efforts` from the API, omit `reasoningMetadata` so the helper falls back to a high-only map with `off: null`:

```ts
reasoning: true,
// No reasoningMetadata: buildThinkingLevelMap falls back to high-only.
compat: {
  supportsDeveloperRole: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "chat-template",
  chatTemplateKwargs: {
    enable_thinking: { $var: "thinking.enabled" },
  },
},
```

Only use this shape after direct requests prove that the model accepts `chat_template_kwargs.enable_thinking`. Use the model's actual role behavior instead of copying `supportsDeveloperRole` from another model.

### Determine pricing carefully

Neuralwatt accounts can use energy-based billing. On those accounts, `x-request-cost-usd`, `x-cache-savings-usd`, and usage totals measure energy billing and do not by themselves establish token prices. Do not derive `cost.input`, `cost.output`, or `cost.cacheRead` from one energy-billed request.

Prefer, in order:

1. Neuralwatt portal pricing.
2. Neuralwatt model metadata when it becomes available.
3. Consistent official upstream or provider pricing corroborated by multiple controlled probes.

Document uncertainty in the implementation comment when pricing remains inferred. Confirm cache reads through token usage even when the cache-savings header remains zero.

### Implement and verify

Read and update:

- `extensions/provider/models/early-access.ts`
- `extensions/provider/models/refresh.ts`
- `extensions/provider/models/refresh.test.ts`
- `extensions/provider/models/index.ts` when a new early-access model collection must be exported

Add tests that prove:

1. The hardcoded early-access model appears and is persisted when `includeEarlyAccessModels` is enabled, even when discovery returns an empty list.
2. The model is absent when `includeEarlyAccessModels` is disabled.
3. The exact runtime-critical config is preserved: modalities, reasoning mapping, compat fields, context, output limit, and costs.
4. Public models retain precedence on ID collisions.

Run the complete model checks because public-catalog validation must remain unchanged:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Create a patch changeset for the package and stage only the early-access model implementation, tests, and changeset.

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
- `extensions/provider/models/early-access.ts`
- `extensions/provider/models/refresh.ts`
- `extensions/provider/models/refresh.test.ts`
- `extensions/provider/models.test.ts`
