---
"@aliou/pi-neuralwatt": patch
---

Fix "No models match pattern" warnings for scoped hidden models.

Hidden models were fetched inside `session_start`, but Pi validates scoped
models during startup before `session_start` fires, so saved scoped entries
like `neuralwatt/glm-5.2-short` warned every launch.

Switch to stale-while-revalidate: the provider extension factory synchronously
restores the previous session's fetch from
`~/.pi/agent/cache/neuralwatt-hidden-models.json` so the provider is registered
with hidden models at load time. `session_start` revalidates from the live API,
writes the cache back, and re-registers the provider. First run with no cache
still warns once.
