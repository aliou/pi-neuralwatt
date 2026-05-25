---
"@aliou/pi-neuralwatt": patch
---

Add `requiresReasoningContentOnAssistantMessages` compat flag for reasoning models. Neuralwatt docs confirm these models need `reasoning_content` on replayed assistant turns to preserve chain-of-thought across turns in agentic conversations.
