---
"@aliou/pi-neuralwatt": minor
---

Add `provider.apiBaseUrl` config. It sets the base URL for the extension's catalog and quota requests and is the fallback for models that carry no `baseUrl` of their own — models.json overrides, custom providers, and proxy routing all take precedence. Defaults to the direct upstream.
