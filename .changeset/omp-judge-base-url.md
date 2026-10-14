---
"@aliou/pi-neuralwatt": patch
---

Fix Neuralwatt judge models on omp posting to `…/v1/v1/systemone` (404). omp's model materializer overwrites every model's own `baseUrl` with the provider-level one, and a runtime `registerProvider` cannot exempt apis via `baseUrlApis`, so the provider config's `/v1` baseUrl was forced onto the `typesafe` judge models and the anthropic-messages surface, doubling the `/v1`. The omp provider baseUrl is now the origin root (required — omp rejects custom models without one), which the judge's `<origin>/v1/systemone` and the Anthropic SDK's `<origin>/v1/messages` line up against; the openai-completions surface, whose SDK appends `/chat/completions`, gets its `/v1` root reapplied in the wrapped stream before delegating.
