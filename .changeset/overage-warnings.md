---
"@aliou/pi-neuralwatt": patch
---

Quota warnings now progress through the billing stages and compute overage cap progress instead of emitting a binary "in overage" alert.

- Subscribed in overage with a cap: warn about overage cap progress, derived from (kwh_used - kwh_included) at $5/kWh. Credits are skipped because a cap means they're never reached.
- Subscribed in overage with no cap, or cap exhausted: fall through to balance credits.
- Unsubscribed with a cap: warn about overage cap progress, billed at $10/kWh.
- Each stage uses its own alert key so a later stage suppresses the earlier one instead of re-reporting a depleted pool.
- Usage totals (monthly/lifetime USD) are no longer used as a threshold basis; they're not directly tied to the subscription kWh quota.
