---
"@aliou/pi-neuralwatt": patch
---

Sync the Kimi K2.7 Code fallback reasoning metadata with the live API.

The API now reports mandatory reasoning with no selectable efforts (`supported_efforts: []`) for the Kimi K2.7 Code family, so every thinking level is nulled out instead of falling back to a high-only map.
