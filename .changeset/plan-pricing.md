---
"@aliou/pi-neuralwatt": minor
---

Add a shared plan pricing table and a nightly drift check for it. `src/lib/plan-pricing.ts` now holds the one table (plan price, included kWh, monthly/annual overage rates) sourced from the public pricing page and Billing FAQ — the quota-warnings extension derives its overage rates from it instead of a private copy, and the subscription tab in `/neuralwatt:quota` shows the plan price. `pnpm check:pricing` (also run daily by a new `pricing-sync` workflow, mirroring `model-sync`) diffs the table against the public pages and, best-effort, against the live `/v1/quota` allowance — the key is sent as a header when `NEURALWATT_API_KEY` is set but never required, and `NEURALWATT_API_BASE_URL` routes the quota call through the Aperture connector in CI. Also types the `kwh_reset_date` field the quota API already returns.
