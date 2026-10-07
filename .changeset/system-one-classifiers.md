---
"@aliou/pi-neuralwatt": minor
---

Support Neuralwatt decision models as Pi classifiers. Key-scoped `/v1/models` catalogs now compile `task: "decision"` entries (e.g. `clef-flash`) into classifier models stamped with the `typesafe-system-one` classifier API, served through a new System One module that posts `{ model, state, questions }` to `/v1/systemone` and returns pi-ai `ClassifierResult` answers with per-choice probabilities. Classifiers appear in `getAllModels()` (and `models.classify()` / `models.getAvailableOfType("classifier")`) but never in the chat-only `getModels()`, so `/model` is unaffected. The offline fallback catalog stays chat-only. Requires pi 1.0.0: the peer floor for `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` moves to `>=1.0.0`.
