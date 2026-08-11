---
"@aliou/pi-neuralwatt": patch
---

Add `kimi-k3-flex`, the Flex-tier variant of Kimi K3 announced in Neuralwatt
Cloud Community Update #6 (2026-08-11). Same model, context window, output
cap, and thinking levels as `kimi-k3`, admitted on spare capacity at the 35%
Flex discount via `costMultiplier`. The public `/v1/models` catalog lists
`kimi-k3-flex` at standard pricing (the discount is billing-time only), so the
drift test skips price checks for it while still validating limits and
capabilities. Resolves the `kimi-k3-flex: Missing from hardcoded models (NEW)`
drift-test discrepancy.
