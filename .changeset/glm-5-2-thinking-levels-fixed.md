---
"@aliou/pi-neuralwatt": patch
---

Fix GLM-5.2 thinkingLevelMap to match Neuralwatt's reasoning_effort normalization.

GLM-5.2 has two native reasoning depths (high, max) plus thinking-off. Only expose
the levels the model actually distinguishes: high -> high, xhigh -> max, and disable
thinking (null) for minimal/low/medium so users get the behavior the level name implies
instead of Neuralwatt silently normalizing low/medium to high.
