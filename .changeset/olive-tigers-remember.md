---
"@aliou/pi-neuralwatt": patch
---

Fix reasoning replay across turns: replayed chain-of-thought is sent as `reasoning` only, matching what the gateway streams and documents, so multi-turn conversations keep the model's prior reasoning instead of silently dropping it on every turn after the first. The persisted model store scope is bumped to v2 so previously cached catalogs are invalidated.
