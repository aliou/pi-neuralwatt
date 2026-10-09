---
"@aliou/pi-neuralwatt": patch
---

Refetch the model catalog when `provider.apiBaseUrl` changes. The cached catalog was keyed only by auth scope, so after switching to a gateway pi kept the upstream catalog for up to four hours and missed models only the gateway serves, such as the `clef-flash` classifier.
