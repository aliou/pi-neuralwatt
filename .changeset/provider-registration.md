---
"@aliou/pi-neuralwatt": minor
---

Register the Neuralwatt provider as a complete pi-ai `Provider` via `pi.registerProvider(provider)` instead of the name-plus-config form, with auth resolution that falls back to an anonymous credential so the model catalog refreshes without an API key.
