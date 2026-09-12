---
"@aliou/pi-neuralwatt": patch
---

Remove the 327,680 context-window override from the Kimi K3 family. The endpoint no longer rejects requests above 327,680 tokens; both `/v1/models` (`max_model_len`, `limits.max_context_length`) and the live endpoints now agree on 1,048,560 for `kimi-k3`, `kimi-k3-fast`, and `kimi-k3-flex`. The fallback table and drift check follow the API again.
