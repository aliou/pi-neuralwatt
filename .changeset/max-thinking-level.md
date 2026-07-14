---
"@aliou/pi-neuralwatt": minor
---

Expose Pi's `max` thinking level (introduced in Pi 0.80.6) on GLM-5.2 reasoning models. GLM-5.2 natively supports `high` and `max` reasoning efforts, so Pi's `max` level now maps directly to the provider's `max` value; `xhigh` is marked as an unsupported hole between `high` and `max`. Verified `reasoning_effort: "max"` against the Neuralwatt API (glm-5.2 produces extended thinking). Peer dependency range tightened to `>=0.80.6` for the Pi core packages since the source now references the `max` thinking level.
