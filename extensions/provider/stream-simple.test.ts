import type { Model, TranscriptContext } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { getApiProvider } from "@earendil-works/pi-ai/compat";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NeuralwattRateLimitInfo } from "./rate-limit-error";
import {
  type AnyStreamSimple,
  wrapNeuralwattStreamSimple,
} from "./stream-simple";

const originalFetch = globalThis.fetch;

const transcript: TranscriptContext = normalizeContext({
  messages: [{ role: "user", content: "hi", timestamp: 0 }],
});

const model: Model<"openai-completions"> = {
  id: "nw/test",
  name: "nw/test",
  api: "openai-completions",
  provider: "neuralwatt",
  baseUrl: "https://api.neuralwatt.com/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

function makeSseResponse(lines: string[]): Response {
  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

// pi-ai's SSE parser splits events on blank lines.
function makeSseEventResponse(events: string[]): Response {
  return new Response(`${events.join("\n\n")}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function makeChatChunk(content: string, finishReason: string | null): string {
  return `data: ${JSON.stringify({
    id: "chatcmpl-x",
    object: "chat.completion.chunk",
    created: 1,
    model: model.id,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
  })}`;
}

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("wrapNeuralwattStreamSimple (fake base)", () => {
  it("injects options.fetch and chains onto a caller-provided fetch", async () => {
    const callerFetch = vi.fn(
      async () => new Response("data: [DONE]\n\n", { status: 200 }),
    );
    globalThis.fetch = vi.fn(async () => {
      throw new Error("global fetch must not be used");
    }) as never;

    let injectedFetch: typeof fetch | undefined;
    const base: AnyStreamSimple = (_model, _context, options) => {
      injectedFetch = options?.fetch;
      return createAssistantMessageEventStream();
    };

    const wrapped = wrapNeuralwattStreamSimple(base, {
      onSseQuota: () => {},
      onRateLimit: () => {},
    });
    wrapped(model, transcript, { fetch: callerFetch });

    expect(injectedFetch).toBeDefined();
    expect(injectedFetch).not.toBe(callerFetch);

    const response = await injectedFetch?.(
      "https://api.neuralwatt.com/v1/chat/completions",
    );
    expect(callerFetch).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toBe(callerFetch);
    expect(response?.status).toBe(200);
  });

  it("resolves globalThis.fetch at request time when no caller fetch is given", async () => {
    const lateFetch = vi.fn(
      async () => new Response("data: [DONE]\n\n", { status: 200 }),
    );

    let injectedFetch: typeof fetch | undefined;
    const base: AnyStreamSimple = (_model, _context, options) => {
      injectedFetch = options?.fetch;
      return createAssistantMessageEventStream();
    };

    const wrapped = wrapNeuralwattStreamSimple(base, {
      onSseQuota: () => {},
      onRateLimit: () => {},
    });
    wrapped(model, transcript);

    // Installed after the wrapped call: the wrapper must resolve the global
    // lazily, at request time.
    globalThis.fetch = lateFetch as never;
    await injectedFetch?.("https://api.neuralwatt.com/v1/chat/completions");
    expect(lateFetch).toHaveBeenCalledOnce();
  });

  it("ignores requests to origins other than the model's provider origin", async () => {
    const onRateLimit = vi.fn();
    const onSseQuota = vi.fn();
    const callerFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 429,
          headers: {
            "X-Concurrent-Limit-Dimension": "model",
            "X-Concurrent-Limit-Active": "3",
            "X-Concurrent-Limit-Max": "2",
          },
        }),
    );

    let injectedFetch: typeof fetch | undefined;
    const base: AnyStreamSimple = (_model, _context, options) => {
      injectedFetch = options?.fetch;
      return createAssistantMessageEventStream();
    };

    const wrapped = wrapNeuralwattStreamSimple(base, {
      onSseQuota,
      onRateLimit,
    });
    // model.baseUrl is api.neuralwatt.com; the request below goes elsewhere.
    wrapped(model, transcript, { fetch: callerFetch });

    const response = await injectedFetch?.(
      "https://example.com/v1/chat/completions",
    );
    expect(response?.status).toBe(429);
    expect(onRateLimit).not.toHaveBeenCalled();
    expect(onSseQuota).not.toHaveBeenCalled();
  });

  it("tees anthropic /messages responses for quota comments", async () => {
    const onSseQuota = vi.fn();
    const callerFetch = vi.fn(async () =>
      makeSseResponse([': cost {"request_cost_usd":0.000189}', "data: [DONE]"]),
    );

    let injectedFetch: typeof fetch | undefined;
    const base: AnyStreamSimple = (_model, _context, options) => {
      injectedFetch = options?.fetch;
      return createAssistantMessageEventStream();
    };

    const wrapped = wrapNeuralwattStreamSimple(base, {
      onSseQuota,
      onRateLimit: () => {},
    });
    wrapped(model, transcript, { fetch: callerFetch });

    const response = await injectedFetch?.(
      "https://api.neuralwatt.com/v1/messages",
    );
    await response?.text();
    // The tee reader runs on its own branch; give it a microtask turn.
    await vi.waitFor(() => {
      expect(onSseQuota).toHaveBeenCalledWith(
        ': cost {"request_cost_usd":0.000189}',
      );
    });
  });
});

// End-to-end through pi-ai's real openai-completions streamSimple (the same
// base the production provider wraps): only fetch is fake.
describe("wrapNeuralwattStreamSimple (e2e, real pi-ai streamSimple)", () => {
  function realBase(): AnyStreamSimple {
    const provider = getApiProvider("openai-completions");
    if (!provider) throw new Error("openai-completions api not registered");
    return provider.streamSimple as AnyStreamSimple;
  }

  it("captures 429 rate-limit headers via onRateLimit and leaves globalThis.fetch untouched", async () => {
    const onRateLimit = vi.fn();
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 429,
          headers: {
            "Retry-After": "0",
            "X-Concurrent-Limit-Dimension": "model",
            "X-Concurrent-Limit-Active": "3",
            "X-Concurrent-Limit-Max": "2",
          },
        }),
    );
    // A tripwire global proves the per-request fetch is used instead.
    globalThis.fetch = vi.fn(async () => {
      throw new Error("global fetch must not be used");
    }) as never;

    const wrapped = wrapNeuralwattStreamSimple(realBase(), {
      onSseQuota: () => {},
      onRateLimit,
    });
    const events = await collect(
      wrapped(model, transcript, { apiKey: "test-key", fetch: fetchMock }),
    );

    expect(onRateLimit).toHaveBeenCalledWith({
      layer: "concurrent",
      retryAfter: 0,
      detail: expect.stringContaining(
        "Concurrent request limit reached (3/2 active, model-scoped)",
      ),
    } satisfies NeuralwattRateLimitInfo);

    // The streamed error carries the SDK's generic 429 text; the detailed
    // rewrite happens later in the message_end handler.
    const errorEvent = events.find(
      (event) => (event as { type?: string }).type === "error",
    ) as { error: { errorMessage?: string; stopReason: string } };
    expect(errorEvent.error.stopReason).toBe("error");
    expect(errorEvent.error.errorMessage).toContain("429");
    expect(errorEvent.error.errorMessage).not.toContain("429 rate limit:");

    expect(globalThis.fetch).not.toBe(fetchMock);
  });

  it("tees successful SSE responses and emits quota comments", async () => {
    const onSseQuota = vi.fn();
    const fetchMock = vi.fn(async () =>
      makeSseEventResponse([
        ': energy {"energy_joules":360000}',
        makeChatChunk("hi", null),
        `data: ${JSON.stringify({
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
        })}`,
        "data: [DONE]",
      ]),
    );

    const wrapped = wrapNeuralwattStreamSimple(realBase(), {
      onSseQuota,
      onRateLimit: () => {},
    });
    const events = await collect(
      wrapped(model, transcript, { apiKey: "test-key", fetch: fetchMock }),
    );

    await vi.waitFor(() => {
      expect(onSseQuota).toHaveBeenCalledWith(
        ': energy {"energy_joules":360000}',
      );
    });

    const doneEvent = events.find(
      (event) => (event as { type?: string }).type === "done",
    ) as { message: { stopReason: string } };
    expect(doneEvent.message.stopReason).toBe("stop");
  });
});
