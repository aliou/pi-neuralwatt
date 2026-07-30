---
"@aliou/pi-neuralwatt": patch
---

Fix stale `ExtensionContext` crash in `quota-warnings` after session replacement. Both `quota-warnings` and `sub-bar-integration` captured the session ctx in a module-level variable and dereferenced it inside the shared-bus `neuralwatt:quotas:updated` handler; after `newSession`/`fork`/`switchSession`/`reload`, pi invalidates captured session-bound ctx and the deref threw. The quota subscription is now session-scoped: it subscribes in `session_start` (capturing the fresh ctx in the closure) and unsubscribes in `session_shutdown`, so the handler never runs with a stale ctx.
