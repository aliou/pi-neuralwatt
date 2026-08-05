---
"@aliou/pi-neuralwatt": patch
---

Sync the model lineup with the latest Neuralwatt changes.

- **Kimi K3 is now public**: graduated from early-access to the public catalog
  (still in preview with limited concurrency). Moved from `early-access.ts`
  to `public-models.ts` with its `-fast` variant (thinking disabled shorthand).
- **Kimi K2.6 retired** (8/3): removed from public models, added to legacy
  aliases redirecting to Kimi K2.7 Code.
- **Qwen 3.5 retired** (8/3): removed from public models, added to legacy
  aliases redirecting to Qwen 3.6.
- **DeepSeek V4 Flash 0731 weights**: updated comment to note the new
  checkpoint; no routing change needed (automatic).
- **Cache pricing at 10%**: already applied in the prior sync; DeepSeek V4
  Flash remains the exception at 20% of input rate.
- **Flex drift test fix**: the API now advertises flex variants at standard
  pricing (the 35% discount is billing-time only), so the drift test skips
  price comparisons for flex models while still checking limits and
  capabilities.
