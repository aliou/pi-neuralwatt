---
"@aliou/pi-neuralwatt": minor
---

Derive reasoning levels from the endpoint's `supported_efforts`.

`thinkingLevelMap` is now built by identity from each model's
`metadata.reasoning.supported_efforts` (plus `mandatory`) via a single
`buildThinkingLevelMap` helper, instead of hand-tuned per-family constants.
Early-access models read the live `metadata.reasoning` block through the same
helper. `default_effort` and `effort_aliases` are no longer consumed.

Behavior changes for the public catalog:
- DeepSeek V4 Flash: `low` is no longer exposed (the API aliases it to `high`;
  identity mapping drops it).
- Kimi K3: `off` is now exposed (`mandatory: false` upstream).
- Kimi K2.7 Code: high-only fallback map, unchanged in effect.
