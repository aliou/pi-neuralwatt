---
"@aliou/pi-neuralwatt": patch
---

Respect `PI_OFFLINE` environment variable. Live model fetching on session start is now skipped when `PI_OFFLINE` is set to `1`, `true`, or `yes`, keeping the hardcoded cache active.
