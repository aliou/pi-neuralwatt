---
"@aliou/pi-neuralwatt": patch
---

Correct two model-catalog drifts found by the live API diff test.

- `kimi-k2.7-code-fast` now declares `reasoning: true`. K2.7 Code cannot disable thinking; the `-fast` variant caps the reasoning budget (~64 tokens) rather than turning it off. Confirmed at runtime: the response includes populated `reasoning_content`. The variant inherits the family's binary thinking map (`high: "high"`, `off: null`).
- Add `deepseek-v4-flash-flex`, the Flex-tier variant of DeepSeek V4 Flash. Same model, context window (1,048,560), output cap (65,536), and pricing as standard, declared with `costMultiplier: FLEX_COST_MULTIPLIER` for the 35% streaming discount. Runtime request confirmed.

No cost changes: authenticated catalog prices match the hardcoded definitions for all models.
