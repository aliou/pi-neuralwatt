---
"@aliou/pi-neuralwatt": minor
---

Add a `provider.api` setting (`/neuralwatt:settings` → **API**, default `openai-completions`) that serves the catalog on Neuralwatt's Anthropic-compatible `POST /v1/messages` endpoint (vLLM-backed) — native tool use and thinking streams with the same model ids. Applies on `/reload`.

- Thinking levels resolve per model from the catalog's `supported_efforts` + `effort_aliases` (vLLM's `output_config.effort` enum only accepts native values); reasoning off is expressed as `chat_template_kwargs.enable_thinking=false` because the endpoint accepts but ignores `thinking:{type:"disabled"}`.
- Usage cost on this surface is rate-derived from the model's per-MTok pricing (the adapter discards the server's `cost` field).
- Quota tracking works on both surfaces: `/v1/messages` streams emit the same `: energy` / `: cost` SSE comments as chat-completions, which the stream tee now feeds into the same quota events; per-response quota headers remain chat-completions-only and `/v1/quota` polling is unchanged. SSE cost comments that carry an absolute `allowance_remaining_usd` now update the credit balance directly on both surfaces.
