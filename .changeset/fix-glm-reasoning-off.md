---
"@aliou/pi-neuralwatt": patch
---

Fix reasoning disable for glm-5.2 and glm-5.2-short. The `thinkingLevelMap` had no `off` entry, so turning thinking off sent no `reasoning_effort` and the model fell back to its default (reasoning on). Verified against the API that `reasoning_effort: "none"` produces zero reasoning content for both models; mapped `off: "none"` accordingly.
