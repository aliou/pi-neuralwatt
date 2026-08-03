---
"@aliou/pi-neuralwatt": patch
---

Fix the `kimi-k3` thinking level map. The early-access entry inherited the
generic "binary thinking" fallback (`medium` only), but Moonshot documents
K3 as always-reasoning with `reasoning_effort` values `low`, `high`, and
`max` (default `max`). Pi's `low`/`high`/`max` now map to the provider
values, and `off`, `minimal`, `medium`, and `xhigh` are unsupported holes.
Verified against the Neuralwatt gateway: the authenticated catalog reports
`capabilities.reasoning_effort: true` for `kimi-k3`, and requests with
`reasoning_effort` `low`/`high`/`max` succeed with reasoning traces.
