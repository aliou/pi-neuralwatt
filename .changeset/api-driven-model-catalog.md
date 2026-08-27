---
"@aliou/pi-neuralwatt": minor
---

Build the model catalog from the live `/v1/models` response instead of local visibility buckets.

Model refresh now fetches anonymously when no API key is configured, builds the catalog with overrides for Flex pricing, Kimi K3 context, Qwen chat-template compatibility, and aliases, persists successful results, and falls back to the bundled public models on failure. The `provider.includeLegacyModelIds`, `provider.includeAliasedModelIds`, and `provider.includeEarlyAccessModels` settings are removed because model visibility now comes from the API.
