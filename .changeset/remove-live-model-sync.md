---
"@aliou/pi-neuralwatt": minor
---

Remove live model sync from provider endpoint. Models are now purely hardcoded in `src/extensions/provider/models.ts` and validated against the Neuralwatt `/v1/models` API at test time.

Removed:
- `src/lib/fetch-models.ts` (live model fetch + `mapApiModel`)
- `src/utils/is-offline.ts` and its test (only used by fetch flow)
- `src/extensions/provider/provider-payload.ts` (`buildModelsPayload` wrapper)
- `NeuralwattModelConfig` type extension (uses `ProviderModelConfig` directly)
- `fast` field on model entries
- Live re-registration on `session_start`

Simplified:
- `NEURALWATT_MODELS_CACHE` → `NEURALWATT_MODELS`
- Provider registers once on startup with hardcoded list
- Tests now fetch live API and compare prices, context windows, reasoning, vision, and model existence
