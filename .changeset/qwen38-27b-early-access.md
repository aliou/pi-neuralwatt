---
"@aliou/pi-neuralwatt": patch
---

Add Qwen3.8 27B FP8 as an early-access model

Qwen/Qwen3.8-27B-FP8 is a pre-release dense 27B vision-language model with
MTP speculative decoding and native 262K context, served on 2x H200. It is
returned by the authenticated /v1/models catalog but absent from the public
endpoint, so it is gated by `provider.includeEarlyAccessModels`. Binary
thinking is toggled through `chat_template_kwargs.enable_thinking`
(`thinkingFormat: "chat-template"`); the API exposes no `reasoning` block, so
the thinking level map is the high-only fallback with `off: null`.

https://huggingface.co/Qwen/Qwen3.8-27B-FP8
