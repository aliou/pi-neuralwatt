---
"@aliou/pi-neuralwatt": patch
---

Add Pi coding-agent 0.84 compatibility for the Neuralwatt model refresh: catalog reads and persistence now go through a runtime shape-detection shim (`src/refresh-store-compat.ts`) that uses the 0.84 `context.stored` snapshot and `context.publish({ persist })` transaction when available, and falls back to the legacy `context.store` read/write on older hosts. Early-access behavior is unchanged: the baseline catalog is persisted and returned when early access is off, cached early-access models merge with the static config when offline, and the full effective catalog persists after a successful network refresh. Abort handling is preserved. The `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui` peer ranges keep their existing floors and now also support 0.84.
