---
"@aliou/pi-neuralwatt": minor
---

Track daily free energy from the new `daily_free_energy` block on `/v1/quota`: a Daily Free Energy bar in the Subscription tab with a per-billing-period total, a quota-warning stage when the day's allowance runs low (re-arms at UTC rollover, configurable via `quotaWarnings.freeEnergy.{enabled,warningPct}`), and a debounced quota refetch after covered-model responses. Closes #144.
