---
"@aliou/pi-neuralwatt": patch
---

Sync model pricing with the live Neuralwatt catalog.

Cache-read prices dropped across families (glm-5.2 0.3625 -> 0.145,
kimi-k2.6 0.1725 -> 0.069, kimi-k2.7-code 0.2375 -> 0.095,
qwen3.5-397b 0.1725 -> 0.069, qwen3.6-35b 0.0725 -> 0.029, gemma-4-31b
0.036 -> 0.0144), and DeepSeek V4 Flash moved to public pricing
(input 0.104 -> 0.14, output 0.207 -> 0.28, cacheRead 0.026 -> 0.028).

The drift test now also recognizes creator-scoped alias IDs from
`aliases.ts`, so the live `deepseek-ai/DeepSeek-V4-Flash` entry no longer
fails the catalog check.
