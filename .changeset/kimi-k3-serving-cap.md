---
"@aliou/pi-neuralwatt": patch
---

Cap all Kimi K3 variants (`kimi-k3`, `kimi-k3-fast`, `kimi-k3-flex`) at the 327,680-token serving limit. The API advertises a 1,048,560-token context with no output cap, but the endpoint rejects requests above 327,680 total tokens with a 400, and Pi's derived `max_completion_tokens` (context window minus prompt tokens) overshot the cap. The drift check now whitelists this intentional divergence via `CONTEXT_WINDOW_OVERRIDES` and flags it as stale once the API metadata matches the serving limit again.
