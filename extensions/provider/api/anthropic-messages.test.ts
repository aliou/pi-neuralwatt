import type {
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import type { NeuralwattModel } from "../models/catalog";
import type { AnyStreamSimple } from "../stream-simple";
import { createAnthropicMessagesApi } from "./anthropic-messages";

const canonicalModel: NeuralwattModel = {
  id: "nw/static",
  name: "nw/static",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const reasoningModel: NeuralwattModel = {
  ...canonicalModel,
  id: "nw/reasoning",
  reasoning: true,
  thinkingLevelMap: {
    off: "none",
    minimal: null,
    low: null,
    medium: null,
    high: "high",
    xhigh: null,
    max: "max",
  },
  reasoningContract: {
    supported_efforts: ["max", "high", "none"],
    mandatory: false,
    effort_aliases: { minimal: "none", xhigh: "max", low: "high" },
  },
};

describe("stamping", () => {
  const stamped = createAnthropicMessagesApi().stampModels([
    canonicalModel,
    reasoningModel,
  ]);

  it("stamps api, origin-root baseUrl, and adaptive compat", () => {
    for (const model of stamped) {
      expect(model.api).toBe("anthropic-messages");
      expect(model.provider).toBe(NEURALWATT_PROVIDER_ID);
      expect(model.baseUrl).toBe(NEURALWATT_BASE_URL.replace(/\/v1$/, ""));
      expect(model.headers).toEqual(NEURALWATT_REQUEST_HEADERS);
      const compat = model.compat as Record<string, unknown>;
      expect(compat.forceAdaptiveThinking).toBe(true);
      expect(compat.supportsStrictTools).toBe(false);
      expect(compat.supportsCacheControlOnTools).toBe(false);
      expect("reasoningContract" in model).toBe(false);
    }
  });

  it("resolves the thinking level map through reasoning aliases", () => {
    expect(stamped[1].thinkingLevelMap).toEqual({
      off: "none",
      minimal: "none",
      low: "high",
      medium: null,
      high: "high",
      xhigh: "max",
      max: "max",
    });
  });

  it("keeps the identity map for models without a retained contract", () => {
    const legacy = { ...reasoningModel };
    delete legacy.reasoningContract;
    const [model] = createAnthropicMessagesApi().stampModels([legacy]);
    expect(model.thinkingLevelMap).toEqual(legacy.thinkingLevelMap);
  });

  it("leaves non-reasoning models without a map", () => {
    expect(stamped[0].thinkingLevelMap).toBeUndefined();
  });
});

function captureStreamSimpleCall(options?: SimpleStreamOptions) {
  const fake = vi.fn<AnyStreamSimple>(() =>
    createAssistantMessageEventStream(),
  );
  createAnthropicMessagesApi({ streamSimple: fake }).streamSimple(
    { id: "nw/static" } as Model<string>,
    { messages: [] } as Context,
    options,
  );
  const captured = fake.mock.calls[0]?.[2]?.onPayload;
  if (!captured) throw new Error("expected a chained onPayload");
  return (body: unknown) =>
    Promise.resolve(captured(body, fake.mock.calls[0]?.[0]));
}

interface TestBody {
  thinking?: { type: string; display?: string };
  output_config?: { effort: string };
  chat_template_kwargs?: Record<string, unknown>;
  [key: string]: unknown;
}

describe("reasoning injector", () => {
  it("passes positive efforts and adaptive thinking through", async () => {
    const call = captureStreamSimpleCall();
    const result = (await call({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
    })) as TestBody;
    expect(result.thinking).toEqual({
      type: "adaptive",
      display: "summarized",
    });
    expect(result.output_config).toEqual({ effort: "high" });
    expect(result.chat_template_kwargs).toBeUndefined();
  });

  it("converts thinking.disabled into enable_thinking=false", async () => {
    // Verified live: thinking:{type:"disabled"} is accepted but ignored, only
    // the chat-template kwarg performs a genuine disable.
    const result = (await captureStreamSimpleCall()({
      thinking: { type: "disabled" },
    })) as TestBody;
    expect(result.thinking).toBeUndefined();
    expect(result.output_config).toBeUndefined();
    expect(result.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("converts effort 'none' (minimal->none alias) into reasoning off", async () => {
    const result = (await captureStreamSimpleCall()({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "none" },
    })) as TestBody;
    expect(result.thinking).toBeUndefined();
    expect(result.output_config).toBeUndefined();
    expect(result.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("converts effort 'minimal' into reasoning off (outside vLLM's enum)", async () => {
    const result = (await captureStreamSimpleCall()({
      output_config: { effort: "minimal" },
    })) as TestBody;
    expect(result.output_config).toBeUndefined();
    expect(result.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("merges with pre-existing chat_template_kwargs", async () => {
    const result = (await captureStreamSimpleCall()({
      thinking: { type: "disabled" },
      chat_template_kwargs: { repetition_penalty: 1.05 },
    })) as TestBody;
    expect(result.chat_template_kwargs).toEqual({
      repetition_penalty: 1.05,
      enable_thinking: false,
    });
  });

  it("chains a caller onPayload and maps its replacement", async () => {
    const upstream = vi.fn(async () => ({ thinking: { type: "disabled" } }));
    const call = captureStreamSimpleCall({ onPayload: upstream } as never);
    const result = (await call({ model: "x" })) as TestBody;
    expect(upstream).toHaveBeenCalledOnce();
    expect(result.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
