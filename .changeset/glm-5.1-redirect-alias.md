---
"@aliou/pi-neuralwatt": patch
---

Convert `glm-5.1` into a legacy alias of `glm-5.2`. GLM-5.1 is fully deprecated on Neuralwatt and now serves the GLM-5.2 deployment via server redirect. Aliasing inherits GLM-5.2's reasoning depths (high, max) and pricing; the latter is expected to converge as the redirect rolls out. The standalone `glm-5.1` canonical entry is removed. `glm-5.1-fast` is unchanged.
