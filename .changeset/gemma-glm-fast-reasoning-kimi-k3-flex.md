---
"@aliou/pi-neuralwatt": patch
---

Sync hardcoded model metadata with the live Neuralwatt catalog:

- `gemma-4-31b` is now a reasoning model. Its chat template takes a boolean
  rather than a graded effort, so it exposes a single Pi thinking level at
  `max` (the model's only depth, since every non-`none` value resolves to
  `max`). It does not reason by default but produces reasoning traces when
  asked.
- `glm-5.2-fast`, `glm-5.2-short-fast`, and `glm-5.2-short-fast-flex` are now
  reasoning models. The `-fast` pin disables thinking by default but keeps the
  parent's full `high`/`max`/`none` contract, so sending `reasoning_effort`
  re-enables thinking for that request. They now inherit the family's
  `thinkingLevelMap`; `kimi-k3-fast` stays non-reasoning because its pin
  survives the effort parameter.
- Add the `kimi-k3-flex` Flex variant, billed at the 65% Flex multiplier.
