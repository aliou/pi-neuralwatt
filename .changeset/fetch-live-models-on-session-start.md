---
"@aliou/pi-neuralwatt": minor
---

Fetch live models from Neuralwatt API on session start. The extension registers with a hardcoded model cache immediately on startup, then fetches `/v1/models` on session start and re-registers the provider with live data (including pricing, capabilities, and limits from the new API metadata). A notification is shown when live models differ from the cache. Falls back to the hardcoded cache if the fetch fails.