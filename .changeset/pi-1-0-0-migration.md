---
"@aliou/pi-neuralwatt": minor
---

Migrate to pi 1.0.0. The provider extension now injects a per-request `options.fetch` wrapper (pi-ai >= 0.83) instead of swapping `globalThis.fetch`, so 429 rate-limit headers are still captured and successful SSE bodies are still teed for live quota comments without touching the global fetch. Stream signatures use `TranscriptContext`, the model catalog narrows `ProviderModelConfig` to its chat member (`ProviderChatModelConfig`), and the peer floor moves to `@earendil-works/pi-ai` / `@earendil-works/pi-coding-agent` `>=0.86.0`. No user-facing behavior change.
