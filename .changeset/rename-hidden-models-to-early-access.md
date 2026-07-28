---
"@aliou/pi-neuralwatt": patch
---

Rename "hidden models" to "early access models".

These models are not hidden, they are pre-release: Neuralwatt ships them to
authorized accounts first and most go public later.

`provider.includeHiddenModels` is now `provider.includeEarlyAccessModels`.
Existing configs are rewritten on load.
