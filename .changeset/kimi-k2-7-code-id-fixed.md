---
"@aliou/pi-neuralwatt": patch
---

Fix Kimi K2.7 Code model ID to match the Neuralwatt /v1/models listing.

The live API exposes this model as `kimi-k2.7-code` (lowercase, no namespace),
not `moonshotai/Kimi-K2.7-Code`. The previous ID caused the models validation
test to report it as missing and prevented requests from routing correctly.
