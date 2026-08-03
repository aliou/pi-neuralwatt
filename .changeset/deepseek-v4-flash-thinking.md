---
"@aliou/pi-neuralwatt": patch
---

Fix the DeepSeek V4 Flash thinking level map. The entry exposed Pi's
`minimal` and `medium` levels mapped to `low`/`medium`, but DeepSeek
documents V4 Flash as accepting only `low`, `high`, and `max`
`reasoning_effort` values (default `high`) — there is no `medium` tier.
Pi's `low`/`high`/`max` now map directly, `off` still disables thinking,
and `minimal`/`medium`/`xhigh` are unsupported holes. Not yet verified
against the Neuralwatt gateway (no API key available); the map follows the
official DeepSeek V4 thinking-mode docs.
