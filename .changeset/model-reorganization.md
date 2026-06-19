---
"@aliou/pi-neuralwatt": patch
---

Reorganize Neuralwatt models into public, legacy, and hidden sections.

- Move model definitions into `src/extensions/provider/models/` with separate files for public models, legacy aliases, and hidden-model discovery.
- Add an `includeHiddenModels` setting (default `false`) that fetches accessible-but-unadvertised models from the authenticated `/v1/models` endpoint once per session start.
- Move Neuralwatt API client calls into `src/lib/neuralwatt-api.ts`.
- Update public model `cacheRead` pricing and move phased-out GLM-5.1 IDs to legacy aliases.
