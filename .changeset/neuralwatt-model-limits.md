---
"@aliou/pi-neuralwatt": patch
---

Correct model output limits and restructure the model catalog.

`maxTokens` now mirrors the API rule `metadata.limits.max_output_tokens ?? max_model_len`
instead of defaulting to 65536. This raises the output cap on `glm-5.2`,
`glm-5.2-fast`, `glm-5.2-flex`, `kimi-k2.6{,-fast,-flex}`, `kimi-k2.7-code{,-flex}`,
`qwen3.5-397b{,-fast}`, `qwen3.6-35b{,-fast}`, and early-access `kimi-k3`; it lowers
`glm-5.2-short-flex` and `glm-5.2-short-fast-flex` to their real 32000 cap.

Flex variants now cost 65% of their standard counterpart, matching the documented
35% Flex tier discount.

Adds `kimi-k2.7-code-fast`. Public models are now declared as a family/variant
table built by a shared builder that early-access model discovery reuses, and the drift
test enforces the `maxTokens` rule and skips when the API is unreachable.
