import type {
  AssistantMessage,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import type { NeuralwattModel } from "../models/catalog";
import { NEURALWATT_MODELS } from "../models/public-models";
import type { AnyStreamSimple } from "../stream-simple";
import { createOpenAiCompletionsApi } from "./openai-completions";

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
    off: null,
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    xhigh: null,
    max: "max",
  },
  reasoningContract: {
    supported_efforts: ["max", "high", "low"],
    mandatory: true,
  },
};

describe("stamping", () => {
  const stamped = createOpenAiCompletionsApi().stampModels([
    canonicalModel,
    reasoningModel,
  ]);

  it("stamps api, baseUrl, and headers, dropping the retained contract", () => {
    for (const model of stamped) {
      expect(model.api).toBe("openai-completions");
      expect(model.provider).toBe(NEURALWATT_PROVIDER_ID);
      expect(model.baseUrl).toBe(NEURALWATT_BASE_URL);
      expect(model.headers).toEqual(NEURALWATT_REQUEST_HEADERS);
      expect("reasoningContract" in model).toBe(false);
    }
  });
});

function captureStreamSimpleCall(options?: SimpleStreamOptions) {
  const fake = vi.fn<AnyStreamSimple>(() =>
    createAssistantMessageEventStream(),
  );
  createOpenAiCompletionsApi({ streamSimple: fake }).streamSimple(
    { id: "nw/reasoning" } as Model<string>,
    { messages: [] } as Context,
    options,
  );
  const captured = fake.mock.calls[0]?.[2]?.onPayload;
  if (!captured) throw new Error("expected a chained onPayload");
  return (body: unknown) =>
    Promise.resolve(captured(body, fake.mock.calls[0]?.[0]));
}

interface TestBody {
  messages?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

describe("reasoning replay injector", () => {
  it("renames replayed `reasoning` to `reasoning_content` on assistant messages", async () => {
    const result = (await captureStreamSimpleCall()({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "ok", reasoning: "thinking text" },
        { role: "user", content: "done" },
      ],
    })) as TestBody;
    expect(result.messages?.[1]).toEqual({
      role: "assistant",
      content: "ok",
      reasoning_content: "thinking text",
    });
    expect("reasoning" in result.messages![1]).toBe(false);
  });

  it("moves the field instead of copying it, so an empty reasoning_content never shadows the replay", async () => {
    const result = (await captureStreamSimpleCall()({
      messages: [{ role: "assistant", content: "ok", reasoning: "t" }],
    })) as TestBody;
    expect(result.messages?.[0]).toEqual({
      role: "assistant",
      content: "ok",
      reasoning_content: "t",
    });
    expect(Object.keys(result.messages?.[0] ?? {}).sort()).toEqual([
      "content",
      "reasoning_content",
      "role",
    ]);
  });

  it("keeps an existing non-empty reasoning_content and drops the duplicate", async () => {
    const result = (await captureStreamSimpleCall()({
      messages: [
        {
          role: "assistant",
          content: "ok",
          reasoning: "stale",
          reasoning_content: "kept",
        },
      ],
    })) as TestBody;
    expect(result.messages?.[0]).toEqual({
      role: "assistant",
      content: "ok",
      reasoning_content: "kept",
    });
  });

  it("leaves non-assistant messages and other fields untouched", async () => {
    const body = {
      model: "nw/reasoning",
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          tool_calls: [{ id: "call_1" }],
          reasoning: "planned",
        },
        { role: "tool", content: "result", tool_call_id: "call_1" },
      ],
    };
    const result = (await captureStreamSimpleCall()(body)) as TestBody;
    expect(result.model).toBe("nw/reasoning");
    expect(result.messages?.[0]).toEqual({ role: "user", content: "hi" });
    expect(result.messages?.[1]).toEqual({
      role: "assistant",
      tool_calls: [{ id: "call_1" }],
      reasoning_content: "planned",
    });
    expect(result.messages?.[2]).toEqual({
      role: "tool",
      content: "result",
      tool_call_id: "call_1",
    });
  });

  it("passes through bodies without a messages array", async () => {
    const body = { model: "nw/reasoning" };
    const result = (await captureStreamSimpleCall()(body)) as TestBody;
    expect(result).toBe(body);
  });

  it("chains a caller onPayload and renames on its replacement", async () => {
    const upstream = vi.fn(async () => ({
      messages: [{ role: "assistant", content: "ok", reasoning: "t" }],
    }));
    const call = captureStreamSimpleCall({ onPayload: upstream } as never);
    const result = (await call({ model: "x" })) as TestBody;
    expect(upstream).toHaveBeenCalledOnce();
    expect(result.messages?.[0]).toEqual({
      role: "assistant",
      content: "ok",
      reasoning_content: "t",
    });
  });
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeSseResponse(events: string[]): Response {
  const body = `${events.map((event) => `data: ${event}\n`).join("\n")}\ndata: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// End-to-end through pi-ai's real openai-completions replay path: the prior
// assistant turn carries a thinking block with the `reasoning` signature pi-ai
// recorded from the K3 stream (no mocks of pi-ai itself; only fetch is fake).
describe("end-to-end replay through pi-ai", () => {
  it("sends prior thinking as reasoning_content and no reasoning key", async () => {
    const k3 = NEURALWATT_MODELS.find((model) => model.id === "kimi-k3");
    if (!k3) throw new Error("kimi-k3 missing from the fallback catalog");
    const [model] = createOpenAiCompletionsApi().stampModels([
      k3 as NeuralwattModel,
    ]);

    const turn1: AssistantMessage = {
      role: "assistant",
      api: model.api,
      provider: model.provider,
      model: model.id,
      stopReason: "stop",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      content: [
        {
          type: "thinking",
          thinking: "The user asks me to think briefly then reply with ok.",
          // What pi-ai records when K3 streams reasoning in `reasoning`.
          thinkingSignature: "reasoning",
        },
        { type: "text", text: "ok" },
      ],
      timestamp: 1,
    };

    const context: Context = {
      messages: [
        {
          role: "user",
          content: "Think briefly, then reply with the single word ok.",
          timestamp: 0,
        },
        turn1,
        {
          role: "user",
          content: "Reply with the single word done.",
          timestamp: 2,
        },
      ],
    };

    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return makeSseResponse([
          JSON.stringify({
            id: "chatcmpl-x",
            object: "chat.completion.chunk",
            created: 1,
            model: model.id,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "done" },
                finish_reason: null,
              },
            ],
          }),
          JSON.stringify({
            id: "chatcmpl-x",
            object: "chat.completion.chunk",
            created: 1,
            model: model.id,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 1,
              total_tokens: 11,
            },
          }),
        ]);
      },
    );
    globalThis.fetch = fetchMock as never;

    const stream = createOpenAiCompletionsApi().streamSimple(model, context, {
      apiKey: "test-key",
      reasoning: "high",
    });
    await stream.result();

    expect(fetchMock).toHaveBeenCalledOnce();
    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const replayed = messages.find(
      (message) =>
        message.role === "assistant" &&
        ("reasoning" in message || "reasoning_content" in message),
    );
    expect(replayed).toBeDefined();
    expect(replayed).toEqual({
      role: "assistant",
      content: "ok",
      reasoning_content:
        "The user asks me to think briefly then reply with ok.",
    });
    expect("reasoning" in (replayed ?? {})).toBe(false);
  });
});
