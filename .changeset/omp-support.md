---
"@aliou/pi-neuralwatt": minor
---

Add omp support. The provider detects the host at load: pi keeps its existing provider registration, while omp registers the Neuralwatt provider through omp's `registerProvider(name, config)` API (custom api id, wrapped `streamSimple`, `fetchDynamicModels`) so it loads without errors and lists Neuralwatt models. On omp the provider also declares an `oauth` login flow: `/login neuralwatt` prompts for an API key, validates it against `/v1/models`, and stores it in omp's credential store, so requests authenticate without `NEURALWATT_API_KEY`. TypeBox value validation falls back to omptype callable schemas on omp. Because omp lacks the pi-only hooks the provider uses, the equivalent behaviour runs at the transport level: the per-request `fetch` wrapper stamps `X-NW-Conversation-ID` from `options.sessionId` and rewrites 429 / context-overflow error bodies before omp's transport parses them, and the quota-warnings and sub-bar extensions observe model switches by diffing `ctx.models.current()` across turns. The pi paths (`before_provider_headers`, `message_end` rewriting, `model_select`) are unchanged.

On omp, Neuralwatt decision models (e.g. `clef-flash`) register as `judge` models on omp's native `typesafe` api, which posts to `/v1/systemone`, so they are available to omp's judge role.
