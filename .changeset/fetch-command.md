---
"@aliou/pi-neuralwatt": minor
---

Add `/neuralwatt:fetch` command: fetch models live, replace hardcoded list

Replace the hardcoded public model list and the `session_start` discovery cache
with a single on-demand command. Running `/neuralwatt:fetch` hits the
authenticated `/v1/models` endpoint and atomically replaces the provider's
model list (via `registerProvider`, which swaps models in one call — clear then
write in one step).

- `models/index.ts` now exposes a single `loadNeuralwattModels()` that returns
  every live (non-deprecated, non-pricing-tbd) model the API reports. The
  public/hidden split, dedupe step, and disk cache are gone.
- `provider/index.ts` ships an empty model list, drops the `session_start`
  discovery block, and registers `/neuralwatt:fetch`. The existing
  quota / rate-limit / context-overflow handlers are unchanged.
- Removed the now-inert `includeLegacyModelIds` and `includeHiddenModels`
  config toggles (type, defaults, settings rows, migration, schema).
- Deleted `models/public-models.ts`, `models/legacy.ts`, `models/hidden.ts`,
  and `models/cache.ts`.

Behavior change: the provider starts with no models each session. Run
`/neuralwatt:fetch` once to populate the picker.
