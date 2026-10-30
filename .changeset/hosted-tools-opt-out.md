---
"@aliou/pi-neuralwatt": minor
---

Add a `hostedTools.enabled` setting that, when explicitly set to `false`, sends the `X-NW-Tools-Opt-Out` header on OpenAI-surface requests to disable Neuralwatt hosted tools. Unset leaves requests untouched.
