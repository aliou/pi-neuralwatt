---
"@aliou/pi-neuralwatt": patch
---

Fix reasoning replay on the openai-completions surface: prior-turn chain-of-thought is replayed in the `reasoning` field (the field K3 streams), but the served chat templates only render `reasoning_content`, so the model never saw its earlier thinking on any turn after the first. The surface now renames `reasoning` to `reasoning_content` on replayed assistant messages. This is a move, not a copy — an empty `reasoning_content` next to a populated `reasoning` is preferred by the gateway and would drop the replay again.
