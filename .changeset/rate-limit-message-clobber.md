---
"@aliou/pi-neuralwatt": patch
---

Fix rate-limit errors always showing the generic fallback message.

`wrapNeuralwattStreamSimple` captures 429 headers and formats a detailed,
layer-specific message (e.g. "Concurrent request limit reached (6/5 active,
user-scoped)"). But the `message_end` handler then overwrote any error
containing "429" with "Neuralwatt rate limit reached, but Pi did not receive
layer-specific rate-limit headers" — clobbering the wrap's output.

The fallback only fired because `after_provider_response` never observes 429s:
the OpenAI SDK throws before Pi's `onResponse` hook runs, so
`pendingRateLimitInfo` is always undefined for 429s.

Now skip the fallback when the wrap has already formatted a message (detected
via the `429 rate limit:` prefix). The fallback is retained only for genuinely
headerless 429s (e.g. anonymous playground limits, or infra in front of
Neuralwatt).
