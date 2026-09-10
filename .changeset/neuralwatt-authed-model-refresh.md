---
"@aliou/pi-neuralwatt": patch
---

Fix authenticated model discovery being shadowed by the cached anonymous catalog. A fresh store entry persisted without a key only carries the public scope, so logged-in users never saw preview, grant-gated, or private models. Authenticated refreshes now always query `/v1/models` with the API key; anonymous refreshes keep the cache shortcut.
