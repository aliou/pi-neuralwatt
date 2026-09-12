---
"@aliou/pi-neuralwatt": patch
---

Make the model-store cache scaffold-aware. A fresh entry persisted without a key only carries the public scope, so logged-in users never saw preview, grant-gated, or private models — and a key-scoped entry could be replayed for an anonymous user. Each refresh now stamps the persisted entry with the scope it was fetched under (`public` / `key v1`) and treats a scope mismatch as stale: keyed refreshes bypass anonymous entries, anonymous refreshes and cache-only boots no longer replay key-scoped entries, and fresh same-scope entries still skip the network. Legacy entries without a stamp re-fetch once and are restamped. Supersedes the behavior proposed in #90.
