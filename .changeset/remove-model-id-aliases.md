---
"@aliou/pi-neuralwatt": patch
---
fix: remove model-id aliases that should have been dropped with the provider config section

The provider no longer appends alias entries (HuggingFace-style ids such as `zai-org/GLM-5.2-FP8`) to the catalog; only canonical ids are registered. Aliases were unconditional leftovers from the config toggles removed earlier. Sessions pinned to an alias id must re-select the canonical model. Stale alias entries persisted in `~/.pi/agent/models-store.json` age out via the existing TTL/refresh path; no store migration is needed.
