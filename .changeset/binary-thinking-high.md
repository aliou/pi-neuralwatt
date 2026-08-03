---
"@aliou/pi-neuralwatt": patch
---

Move the binary-thinking families (Kimi K2.6, Kimi K2.7 Code, Qwen3.5 397B,
Qwen3.6 35B) off the placeholder `medium` level. Moonshot documents no
`reasoning_effort` support for Kimi K2.x (thinking is a binary on/off
toggle, always-on for K2.7 Code), and Alibaba documents no
`reasoning_effort` field for Qwen3.5/3.6 (hybrid `enable_thinking` only).
The shared binary-thinking map now exposes a single `high` level, which
stands in for standard full thinking, instead of an arbitrary `medium`.
Not yet verified against the Neuralwatt gateway (no API key available).
