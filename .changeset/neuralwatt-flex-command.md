---
"@aliou/pi-neuralwatt": minor
---

Add `/neuralwatt:flex` command for per-session Flex tier configuration.

The new command lets users toggle Neuralwatt's Flex tier and configure a custom
timeout for the current session. When Flex is enabled, `service_tier: "flex"`
is injected into outgoing Neuralwatt requests and the request timeout is
extended. The timeout is also extended automatically for model IDs ending in
`-flex`.
