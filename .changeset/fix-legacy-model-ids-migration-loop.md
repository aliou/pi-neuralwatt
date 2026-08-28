---
"@aliou/pi-neuralwatt": patch
---

Stop the "legacy model IDs are disabled" warning from reappearing on every startup.

The `disable-legacy-model-ids-by-default` migration gated on the absence of a top-level `includeLegacyModelIds` key instead of the stamped config version. On any already-nested config that key is always absent, so the migration re-ran each load: it re-injected the key, the flat-to-nested migration stripped it back out, the config was rewritten, and the warning fired again. The migration is removed because nothing reads `includeLegacyModelIds` anymore.
