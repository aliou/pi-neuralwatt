import type { ClassifierContext, ClassifierModel } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import type { NeuralwattClassifierModel } from "../models/build";
import { classify, stampClassifierModels } from "./system-one";

const configuredBase = vi.hoisted(() => ({
  current: "https://api.neuralwatt.com/v1",
}));

vi.mock("../../../src/config/loader", () => ({
  configuredApiBaseUrl: () => configuredBase.current,
}));

const clefFlash: ClassifierModel<"typesafe-system-one"> = {
  type: "classifier",
  api: "typesafe-system-one",
  id: "clef-flash",
  name: "Clef Flash",
  provider: NEURALWATT_PROVIDER_ID,
  baseUrl: NEURALWATT_BASE_URL,
  input: ["text", "image"],
  cost: { input: 0.18, output: 0, cacheRead: 0.018, cacheWrite: 0 },
  contextWindow: 262_128,
};

const sentimentContext: ClassifierContext = {
  state: {
    text: "This sandboxed workspace is absolutely wonderful and a joy to use.",
  },
  questions: {
    sentiment: {
      type: "choice",
      instructions: "What is the sentiment of the text?",
      criteria: {
        positive: "The text expresses approval or happiness",
        negative: "The text expresses disapproval or sadness",
        neutral: "The text is neither positive nor negative",
      },
    },
  },
};

const realClefFlashResponse = {
  id: "systemone-9ff99f89a8ae43148252e83a2798eb64",
  object: "systemone",
  created: 1791372784,
  model: "clef-flash",
  answers: {
    sentiment: {
      type: "choice",
      choice: "positive",
      confidence: 0.9181,
      probabilities: { positive: 0.9181, negative: 0.034, neutral: 0.0479 },
    },
  },
  truncated: false,
  usage: { input_tokens: 177, output_tokens: 0 },
  energy: {
    energy_joules: 19.83,
    energy_kwh: 5.508e-6,
    avg_power_watts: 155.5,
    duration_seconds: 0.255,
    attribution_method: "prorated",
    attribution_ratio: 0.5,
    carbon_g_co2eq: 0.0002203,
    grid_carbon_intensity_gco2perkwhr: 40.0,
    grid_id: "FI",
    carbon_source: "agent_cache",
  },
  cost: { request_cost_usd: 3.2e-5, cache_savings_usd: 0.0 },
};

function okFetch(body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("classify (System One)", () => {
  it("sends the System One wire request and maps the real clef-flash response", async () => {
    const fetchMock = okFetch(realClefFlashResponse);

    const result = await classify(clefFlash, sentimentContext, {
      apiKey: "test-key",
      fetch: fetchMock as never,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe(`${NEURALWATT_BASE_URL}/systemone`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer test-key",
    );
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "clef-flash",
      state: sentimentContext.state,
      questions: sentimentContext.questions,
    });

    expect(result.stopReason).toBe("stop");
    expect(result.errorMessage).toBeUndefined();
    expect(result.api).toBe("typesafe-system-one");
    expect(result.provider).toBe(NEURALWATT_PROVIDER_ID);
    expect(result.model).toBe("clef-flash");

    expect(result.answers.sentiment).toEqual({
      type: "choice",
      choice: "positive",
      confidence: 0.9181,
      probabilities: { positive: 0.9181, negative: 0.034, neutral: 0.0479 },
    });

    expect(result.usage?.input).toBe(177);
    expect(result.usage?.output).toBe(0);
    expect(result.usage?.totalTokens).toBe(177);
    expect(result.usage?.cost.input).toBeCloseTo(3.186e-5, 8);
  });

  it("maps bool questions to noul on the wire and back", async () => {
    const context: ClassifierContext = {
      state: { text: "hello" },
      questions: {
        is_greeting: {
          type: "bool",
          instructions: "Is the text a greeting?",
          criteria: {
            true: "The text is a greeting",
            false: "The text is not a greeting",
          },
        },
      },
    };
    const fetchMock = okFetch({
      model: "clef-flash",
      answers: { is_greeting: { type: "noul", noul: 0.83 } },
      usage: { input_tokens: 12, output_tokens: 0 },
    });

    const result = await classify(clefFlash, context, {
      apiKey: "test-key",
      fetch: fetchMock as never,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.questions.is_greeting.type).toBe("noul");

    expect(result.stopReason).toBe("stop");
    expect(result.answers.is_greeting).toEqual({
      type: "bool",
      probability: 0.83,
    });
  });

  it("maps score answers", async () => {
    const context: ClassifierContext = {
      state: { text: "the service was okay" },
      questions: {
        quality: {
          type: "score",
          instructions: "Rate the described service quality",
          criteria: ["poor", "ok", "great"],
        },
      },
    };
    const fetchMock = okFetch({
      model: "clef-flash",
      answers: {
        quality: {
          type: "score",
          score: 1,
          legend: ["poor", "ok", "great"],
          probabilities: { poor: 0.1, ok: 0.62, great: 0.28 },
          confidence: 0.62,
        },
      },
      usage: { input_tokens: 20, output_tokens: 0 },
    });

    const result = await classify(clefFlash, context, {
      apiKey: "test-key",
      fetch: fetchMock as never,
    });

    expect(result.stopReason).toBe("stop");
    expect(result.answers.quality).toEqual({
      type: "score",
      score: 1,
      confidence: 0.62,
    });
  });

  it("uses the anonymous placeholder without an API key", async () => {
    const fetchMock = okFetch(realClefFlashResponse);
    const result = await classify(clefFlash, sentimentContext, {
      fetch: fetchMock as never,
    });

    expect(result.stopReason).toBe("stop");
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer -");
  });

  it("merges headers case-insensitively and allows removing authorization", async () => {
    const fetchMock = okFetch(realClefFlashResponse);
    await classify(
      {
        ...clefFlash,
        headers: { Authorization: "Bearer gateway", "X-Test": "model" },
      },
      sentimentContext,
      {
        fetch: fetchMock as never,
        headers: { authorization: null, "x-test": "caller" },
      },
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("x-test")).toBe("caller");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("honors payload and response hooks", async () => {
    const fetchMock = okFetch(realClefFlashResponse);
    const onResponse = vi.fn();
    const payload = { model: "clef-flash", state: {}, questions: {} };
    await classify(clefFlash, sentimentContext, {
      fetch: fetchMock as never,
      onPayload: () => payload,
      onResponse,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(onResponse).toHaveBeenCalledWith(
      { status: 200, headers: { "content-type": "application/json" } },
      clefFlash,
    );
  });

  it("rejects images before making a request", async () => {
    const fetchMock = okFetch(realClefFlashResponse);
    const context: ClassifierContext = {
      ...sentimentContext,
      images: [{ type: "image", data: "", mimeType: "image/png" }],
    };
    const result = await classify(clefFlash, context, {
      fetch: fetchMock as never,
    });
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toBe(
      "Neuralwatt classifier does not support image input",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns aborted without making a request for an aborted signal", async () => {
    const fetchMock = okFetch(realClefFlashResponse);
    const result = await classify(clefFlash, sentimentContext, {
      fetch: fetchMock as never,
      signal: AbortSignal.abort(),
    });
    expect(result.stopReason).toBe("aborted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("combines the timeout with the caller signal", async () => {
    const fetchMock = okFetch(realClefFlashResponse);
    const controller = new AbortController();
    await classify(clefFlash, sentimentContext, {
      fetch: fetchMock as never,
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.signal).not.toBe(controller.signal);
    expect(init.signal?.aborted).toBe(false);
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
  });

  it("returns an error result on HTTP failures instead of rejecting", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "upstream boom",
              type: "server_error",
              code: "internal_error",
            },
          }),
          { status: 500 },
        ),
    );

    const result = await classify(clefFlash, sentimentContext, {
      apiKey: "test-key",
      fetch: fetchMock as never,
      maxRetries: 0,
    } as never);

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("Neuralwatt System One API");
    expect(result.errorMessage).toContain("500");
    expect(result.errorMessage).toContain("upstream boom");
  });

  it("reads System One request validation errors", async () => {
    const result = await classify(clefFlash, sentimentContext, {
      fetch: (async () =>
        new Response(
          JSON.stringify({
            detail:
              "'questions' must be a non-empty object of question id to question",
          }),
          { status: 400 },
        )) as never,
    });
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("400");
    expect(result.errorMessage).toContain(
      "'questions' must be a non-empty object",
    );
  });

  it("returns an error result when an answer is missing from the response", async () => {
    const fetchMock = okFetch({
      model: "clef-flash",
      answers: {},
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const result = await classify(clefFlash, sentimentContext, {
      apiKey: "test-key",
      fetch: fetchMock as never,
      maxRetries: 0,
    } as never);

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("sentiment");
    expect(result.usage?.input).toBe(10);
    expect(result.answers).toEqual({});
  });

  it.each([
    { type: "score", score: 1, confidence: 0.9 },
    {
      type: "choice",
      choice: 1,
      probabilities: { positive: 0.9 },
      confidence: 0.9,
    },
    {
      type: "choice",
      choice: "positive",
      probabilities: { positive: "0.9" },
      confidence: 0.9,
    },
    {
      type: "choice",
      choice: "positive",
      probabilities: { positive: 0.9 },
      confidence: "0.9",
    },
  ])("rejects mistyped answers without losing usage: %j", async (answer) => {
    const result = await classify(clefFlash, sentimentContext, {
      fetch: okFetch({
        answers: { sentiment: answer },
        usage: { input_tokens: 10, output_tokens: 0 },
      }) as never,
    });
    expect(result.stopReason).toBe("error");
    expect(result.answers).toEqual({});
    expect(result.usage?.input).toBe(10);
  });

  it.each([
    null,
    [],
    {},
    "invalid",
  ])("rejects responses with malformed usage: %j", async (usage) => {
    const result = await classify(clefFlash, sentimentContext, {
      fetch: okFetch({ ...realClefFlashResponse, usage }) as never,
    });
    expect(result.stopReason).toBe("error");
    expect(result.answers).toEqual({});
    expect(result.usage).toBeUndefined();
  });

  it("accepts a response without usage", async () => {
    const result = await classify(clefFlash, sentimentContext, {
      fetch: okFetch({ answers: realClefFlashResponse.answers }) as never,
    });
    expect(result.stopReason).toBe("stop");
    expect(result.usage).toBeUndefined();
  });

  it("rejects invalid token counts", async () => {
    const result = await classify(clefFlash, sentimentContext, {
      fetch: okFetch({
        ...realClefFlashResponse,
        usage: { input_tokens: -1, output_tokens: "2" },
      }) as never,
    });
    expect(result.stopReason).toBe("error");
    expect(result.usage).toBeUndefined();
  });

  it("rejects models stamped with another classifier api", async () => {
    const foreign: ClassifierModel<"llama-cpp-classify"> = {
      ...(clefFlash as Omit<
        ClassifierModel<"llama-cpp-classify">,
        "type" | "api"
      >),
      type: "classifier",
      api: "llama-cpp-classify",
    };

    const result = await classify(foreign, sentimentContext, {
      apiKey: "test-key",
      fetch: okFetch(realClefFlashResponse) as never,
    });

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("Unsupported classifier API");
  });
});

describe("stampClassifierModels", () => {
  it("stamps the System One api with Neuralwatt provider/baseUrl/headers", () => {
    const compiled: NeuralwattClassifierModel = {
      type: "classifier",
      api: "typesafe-system-one",
      id: "clef-flash",
      name: "Clef Flash",
      input: ["text", "image"],
      cost: { input: 0.18, output: 0, cacheRead: 0.018, cacheWrite: 0 },
      contextWindow: 262_128,
    };

    const [stamped] = stampClassifierModels([compiled]);
    expect(stamped).toMatchObject({
      type: "classifier",
      api: "typesafe-system-one",
      id: "clef-flash",
      provider: NEURALWATT_PROVIDER_ID,
      baseUrl: NEURALWATT_BASE_URL,
      headers: NEURALWATT_REQUEST_HEADERS,
      contextWindow: 262_128,
    });
  });

  it("respects a model-level baseUrl override", () => {
    const compiled: NeuralwattClassifierModel = {
      type: "classifier",
      api: "typesafe-system-one",
      id: "clef-flash",
      name: "Clef Flash",
      baseUrl: "https://custom.example.com/v1",
      input: ["text"],
      cost: { input: 0.18, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 262_128,
    };

    const [stamped] = stampClassifierModels([compiled]);
    expect(stamped.baseUrl).toBe("https://custom.example.com/v1");
  });
});

describe("classify api base fallback", () => {
  it("falls back to the configured api base URL for models without a baseUrl", async () => {
    configuredBase.current = "https://gateway.example.com/v1";
    const baseless: NeuralwattClassifierModel = {
      type: "classifier",
      api: "typesafe-system-one",
      id: "clef-flash",
      name: "Clef Flash",
      input: ["text"],
      cost: { input: 0.18, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 262_128,
    };
    const [stamped] = stampClassifierModels([baseless]);
    expect(stamped.baseUrl).toBe("https://gateway.example.com/v1");

    const fetchMock = okFetch(realClefFlashResponse);
    await classify(stamped, sentimentContext, {
      apiKey: "test-key",
      fetch: fetchMock as never,
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(String(url)).toBe("https://gateway.example.com/v1/systemone");
  });
});
