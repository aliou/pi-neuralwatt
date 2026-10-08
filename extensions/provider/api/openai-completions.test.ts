import type {
  AssistantMessage,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import type { NeuralwattReasoningReplay } from "../models/build";
import {
  buildNeuralwattProviderModels,
  type NeuralwattChatModel,
} from "../models/catalog";
import { NEURALWATT_MODELS } from "../models/public-models";
import type { AnyStreamSimple } from "../stream-simple";
import { createOpenAiCompletionsApi } from "./openai-completions";

const canonicalModel: NeuralwattChatModel = {
  id: "nw/static",
  name: "nw/static",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const reasoningModel: NeuralwattChatModel = {
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

function captureStreamSimpleCall(
  model: Model<string>,
  options?: SimpleStreamOptions,
) {
  const fake = vi.fn<AnyStreamSimple>(() =>
    createAssistantMessageEventStream(),
  );
  createOpenAiCompletionsApi({ streamSimple: fake }).streamSimple(
    model,
    normalizeContext({ messages: [] }),
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
  const knoblessModel = {
    ...reasoningModel,
    id: "nw/knobless",
  } as unknown as Model<string>;

  const renameModel = {
    ...reasoningModel,
    id: "nw/knobbed",
    reasoningReplay: {
      field: "reasoning_content",
    } satisfies NeuralwattReasoningReplay,
  } as unknown as Model<string>;

  it("passes payloads through untouched for knobless models (default = no rewrite)", async () => {
    const call = captureStreamSimpleCall(knoblessModel);
    const body = {
      model: "nw/knobless",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "ok", reasoning: "thinking text" },
      ],
    };
    const result = (await call(body)) as TestBody;
    expect(result).toEqual(body);
    expect(result.messages?.[1]).toEqual({
      role: "assistant",
      content: "ok",
      reasoning: "thinking text",
    });
  });

  it("moves replayed `reasoning` to the knob's field for knobbed models", async () => {
    const result = (await captureStreamSimpleCall(renameModel)({
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

  it("is a move, not a copy: the `reasoning` key is gone from the message", async () => {
    const result = (await captureStreamSimpleCall(renameModel)({
      messages: [{ role: "assistant", content: "ok", reasoning: "t" }],
    })) as TestBody;
    expect(Object.keys(result.messages?.[0] ?? {}).sort()).toEqual([
      "content",
      "reasoning_content",
      "role",
    ]);
  });

  it("keeps an existing non-empty target and drops the duplicate", async () => {
    const result = (await captureStreamSimpleCall(renameModel)({
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

  it("shallow-merges templateKwargs into existing chat_template_kwargs without renaming reasoning", async () => {
    const kwargsModel = {
      ...reasoningModel,
      id: "nw/kwargs",
      reasoningReplay: {
        templateKwargs: { clear_thinking: false },
      } satisfies NeuralwattReasoningReplay,
    } as unknown as Model<string>;
    const result = (await captureStreamSimpleCall(kwargsModel)({
      chat_template_kwargs: { enable_thinking: true },
      messages: [{ role: "assistant", content: "ok", reasoning: "t" }],
    })) as TestBody;
    expect(result.chat_template_kwargs).toEqual({
      enable_thinking: true,
      clear_thinking: false,
    });
    expect(result.messages?.[0]).toEqual({
      role: "assistant",
      content: "ok",
      reasoning: "t",
    });
  });

  it("creates chat_template_kwargs when absent", async () => {
    const kwargsModel = {
      ...reasoningModel,
      id: "nw/kwargs",
      reasoningReplay: {
        templateKwargs: { clear_thinking: false },
      } satisfies NeuralwattReasoningReplay,
    } as unknown as Model<string>;
    const result = (await captureStreamSimpleCall(kwargsModel)({
      messages: [],
    })) as TestBody;
    expect(result.chat_template_kwargs).toEqual({ clear_thinking: false });
  });

  it("leaves non-assistant messages untouched when a knob renames", async () => {
    const result = (await captureStreamSimpleCall(renameModel)({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          tool_calls: [{ id: "call_1" }],
          reasoning: "planned",
        },
        { role: "tool", content: "result", tool_call_id: "call_1" },
      ],
    })) as TestBody;
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

  it("passes through bodies without a messages array (field knob only)", async () => {
    const body = { model: "nw/knobbed" };
    const result = (await captureStreamSimpleCall(renameModel)(
      body,
    )) as TestBody;
    expect(result).toBe(body);
  });

  it("chains a caller onPayload and applies the knob on its replacement", async () => {
    const upstream = vi.fn(async () => ({
      messages: [{ role: "assistant", content: "ok", reasoning: "t" }],
    }));
    const call = captureStreamSimpleCall(renameModel, {
      onPayload: upstream,
    } as never);
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

const REASONING_FALLBACK_MODELS: NeuralwattChatModel[] = (
  buildNeuralwattProviderModels() as NeuralwattChatModel[]
).filter((model) => model.reasoning);

it("covers every reasoning model in the fallback catalog", () => {
  expect(REASONING_FALLBACK_MODELS.length).toBeGreaterThan(0);
  expect(REASONING_FALLBACK_MODELS.map((model) => model.id).sort()).toEqual(
    NEURALWATT_MODELS.filter((model) => model.reasoning)
      .map((model) => model.id)
      .sort(),
  );
});

describe("end-to-end replay through pi-ai (every reasoning fallback model)", () => {
  it.each(
    REASONING_FALLBACK_MODELS.map((model) => [model.id, model] as const),
  )("%s sends prior thinking as `reasoning` unchanged, with no reasoning_content", async (_id, fallbackModel) => {
    const [model] = createOpenAiCompletionsApi().stampModels([
      fallbackModel as NeuralwattChatModel,
    ]);
    expect(fallbackModel.reasoningReplay).toBeUndefined();

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
          thinkingSignature: "reasoning",
        },
        { type: "text", text: "ok" },
      ],
      timestamp: 1,
    };

    const context = normalizeContext({
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
    });

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
      reasoning: "The user asks me to think briefly then reply with ok.",
    });
    expect("reasoning_content" in (replayed ?? {})).toBe(false);
  });
});
