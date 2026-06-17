import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AnyStreamSimple,
  wrapNeuralwattStreamSimple,
} from "./stream-simple";

const originalFetch = globalThis.fetch;

function makeAssistantMessage(errorMessage?: string) {
  return {
    role: "assistant",
    api: "openai-completions",
    provider: "neuralwatt",
    model: "glm-5.2",
    stopReason: errorMessage ? "error" : "stop",
    errorMessage,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    content: [],
  };
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

describe("wrapNeuralwattStreamSimple", () => {
  it("rewrites 429 stream errors with captured headers", async () => {
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
    globalThis.fetch = fetchMock as never;

    const base: AnyStreamSimple = () => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(async () => {
        await fetch("https://api.neuralwatt.com/v1/chat/completions");
        stream.push({
          type: "error",
          reason: "error",
          error: makeAssistantMessage("429 status code (no body)"),
        } as never);
        stream.end();
      });
      return stream;
    };

    const wrapped = wrapNeuralwattStreamSimple(base, () => {});
    const events = await collect(wrapped({} as never, {} as never));
    const errorEvent = events.find(
      (event) => (event as { type?: string }).type === "error",
    ) as { error: { errorMessage: string; stopReason: string } };

    expect(errorEvent.error.stopReason).toBe("error");
    expect(errorEvent.error.errorMessage).toContain("429 rate limit:");
    expect(errorEvent.error.errorMessage).toContain(
      "Concurrent request limit reached (3/2 active, model-scoped)",
    );
    expect(globalThis.fetch).toBe(fetchMock);
  });

  it("ignores matching paths from other provider origins", async () => {
    const fetchMock = vi.fn(
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
    globalThis.fetch = fetchMock as never;

    const base: AnyStreamSimple = () => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(async () => {
        await fetch("https://example.com/v1/chat/completions");
        stream.push({
          type: "error",
          reason: "error",
          error: makeAssistantMessage("429 status code (no body)"),
        } as never);
        stream.end();
      });
      return stream;
    };

    const wrapped = wrapNeuralwattStreamSimple(base, () => {});
    const events = await collect(wrapped({} as never, {} as never));
    const errorEvent = events.find(
      (event) => (event as { type?: string }).type === "error",
    ) as { error: { errorMessage: string } };

    expect(errorEvent.error.errorMessage).toBe("429 status code (no body)");
  });

  it("tees successful SSE responses and emits quota comments", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(': energy {"energy_joules":360000}\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    globalThis.fetch = fetchMock as never;
    const onSseQuota = vi.fn();

    const base: AnyStreamSimple = () => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(async () => {
        const response = await fetch(
          "https://api.neuralwatt.com/v1/chat/completions",
        );
        await response.text();
        stream.push({
          type: "done",
          reason: "stop",
          message: makeAssistantMessage(),
        } as never);
        stream.end();
      });
      return stream;
    };

    const wrapped = wrapNeuralwattStreamSimple(base, onSseQuota);
    await collect(wrapped({} as never, {} as never));

    expect(onSseQuota).toHaveBeenCalledWith(
      ': energy {"energy_joules":360000}',
    );
    expect(globalThis.fetch).toBe(fetchMock);
  });
});
