---
"@aliou/pi-neuralwatt": patch
---

Fix "No models match pattern" warning for models that graduated from hidden to public.
A stale hidden-models cache could register newly public models twice, making Pi treat the scoped model as ambiguous. Now hidden models are deduped against the public list at registration, and `session_start` always rewrites the cache (even when empty) and re-registers the provider so graduated entries are purged.
