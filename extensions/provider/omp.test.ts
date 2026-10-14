import type { TranscriptContext } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { NEURALWATT_API_BASE_URL } from "../../src/config/defaults";
import { NEURALWATT_BASE_URL } from "./constants";
import {
  NEURALWATT_SYSTEM_ONE_API,
  type NeuralwattClassifierModel,
} from "./models/build";
import type { NeuralwattModel } from "./models/catalog";
import { registerNeuralwattProviderForOmp } from "./omp";

// omp's materializer replaces every model's own baseUrl with the provider
// baseUrl, so the provider config root is what every surface actually sees.
// The judge client appends `/v1/systemone` and the parent Anthropic SDK appends
// `/v1/messages`; both need the origin root, while the OpenAI SDK appends
// `/chat/completions` and so needs the `/v1` root.
const ORIGIN_ROOT = NEURALWATT_API_BASE_URL.replace(/\/v1\/?$/, "");

const transcript: TranscriptContext = normalizeContext({
  messages: [{ role: "user", content: "hi", timestamp: 0 }],
});

const chatModel: NeuralwattModel = {
  id: "nw/chat",
  name: "nw/chat",
  reasoning: false,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const classifierModel: NeuralwattClassifierModel = {
  type: "classifier",
  api: NEURALWATT_SYSTEM_ONE_API,
  id: "clef-flash",
  name: "Clef Flash",
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
};

interface CapturedModel {
  id?: string;
  api?: string;
  kind?: string;
  baseUrl?: string;
}

interface CapturedConfig {
  api?: string;
  baseUrl?: string;
  models?: CapturedModel[];
  streamSimple?: (
    model: CapturedModel,
    context: TranscriptContext,
    options?: { apiKey?: string; fetch?: typeof fetch },
  ) => AsyncIterable<unknown>;
}

interface CapturedRegistration {
  name: string;
  config: CapturedConfig;
}

/**
 * Registers the omp provider against a stub host and returns the config omp
 * would receive. Only `registerProvider` is touched, so the cast is unchecked.
 */
function register(
  api: "openai-completions" | "anthropic-messages",
): CapturedRegistration {
  let captured: CapturedRegistration | undefined;
  const pi = {
    registerProvider(name: string, config: CapturedConfig) {
      captured = { name, config };
    },
  } as unknown as ExtensionAPI;

  registerNeuralwattProviderForOmp(pi, {
    staticModels: [chatModel, classifierModel],
    api,
    fetchApiModels: async () => [],
    // The stream wrapper tees every 2xx body and calls these; leaving them
    // undefined turns the tee reader's call into an unhandled rejection.
    streamCallbacks: { onSseQuota: () => {}, onRateLimit: () => {} },
  });

  if (!captured) throw new Error("registerProvider was not called");
  return captured;
}

/**
 * Mirrors omp's model materializer (`resolveProviderBaseUrl`): a provider-level
 * `baseUrl` replaces each model's own unless the model's api is exempted
 * through `baseUrlApis`. A runtime `registerProvider` cannot supply
 * `baseUrlApis`, so the provider baseUrl wins outright — the behaviour every
 * assertion below is written against.
 */
function materialize(
  config: CapturedConfig,
  model: CapturedModel,
): CapturedModel {
  return { ...model, baseUrl: config.baseUrl ?? model.baseUrl };
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

/** A 200 SSE body — enough for the SDK to dispatch the request and read it. */
function sseResponse(events: string[]): Response {
  return new Response(`${events.join("\n\n")}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function openAiBody(): Response {
  const chunk = (choices: unknown[], usage?: unknown) =>
    `data: ${JSON.stringify({
      id: "chatcmpl-x",
      object: "chat.completion.chunk",
      created: 1,
      model: "nw/chat",
      choices,
      ...(usage ? { usage } : {}),
    })}`;
  return sseResponse([
    chunk([{ index: 0, delta: { role: "assistant", content: "hi" } }]),
    chunk([{ index: 0, delta: {}, finish_reason: "stop" }], {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    }),
    "data: [DONE]",
  ]);
}

function anthropicBody(): Response {
  const event = (type: string, data: unknown) =>
    `event: ${type}\ndata: ${JSON.stringify(data)}`;
  return sseResponse([
    event("message_start", {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "nw/chat",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }),
    event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "hi" },
    }),
    event("content_block_stop", { type: "content_block_stop", index: 0 }),
    event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 1 },
    }),
    event("message_stop", { type: "message_stop" }),
  ]);
}

const CHAT_BODIES = {
  "openai-completions": openAiBody,
  "anthropic-messages": anthropicBody,
} as const;

/** Drives a chat model through the real stream path and returns the URL hit. */
async function chatRequestUrl(
  api: "openai-completions" | "anthropic-messages",
): Promise<string> {
  const { config } = register(api);
  const chat = config.models?.find((model) => model.id === "nw/chat");
  if (!chat || !config.streamSimple) throw new Error("chat model missing");

  // omp hands the custom-api stream the materialized model: the provider
  // baseUrl has already replaced the model's own.
  const materialized = materialize(config, chat);

  const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
    CHAT_BODIES[api](),
  );
  const stream = config.streamSimple(materialized, transcript, {
    apiKey: "test-key",
    fetch: fetchMock as unknown as typeof fetch,
  });
  // Drain so the SDK actually completes the dispatch.
  for await (const _event of stream) {
    // no-op
  }

  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("chat request was not dispatched");
  return urlOf(call[0] as RequestInfo | URL);
}

describe("registerNeuralwattProviderForOmp", () => {
  it("sets the provider baseUrl to the origin root omp forces onto every model", () => {
    const { config } = register("openai-completions");
    expect(config.baseUrl).toBe(ORIGIN_ROOT);
  });

  it("stamps the judge model so omp posts to <origin>/v1/systemone", () => {
    const { config } = register("openai-completions");
    const judge = config.models?.find((model) => model.kind === "judge");
    expect(judge).toBeDefined();
    const effective = materialize(config, judge as CapturedModel).baseUrl;
    // Never the `/v1` root: omp's judge client appends `/v1` itself, so `/v1`
    // here would post to `…/v1/v1/systemone` (404).
    expect(effective).toBe(ORIGIN_ROOT);
    expect(`${effective}/v1/systemone`).toBe(
      "https://api.neuralwatt.com/v1/systemone",
    );
  });

  it("sends openai-completions chat requests under the /v1 root", async () => {
    const url = new URL(await chatRequestUrl("openai-completions"));
    expect(`${url.origin}${url.pathname}`).toBe(
      `${NEURALWATT_BASE_URL}/chat/completions`,
    );
  });

  it("sends anthropic-messages chat requests under the origin root", async () => {
    const url = new URL(await chatRequestUrl("anthropic-messages"));
    // The Anthropic SDK appends `?beta=true`; the base path is the contract.
    expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN_ROOT}/v1/messages`);
  });
});
