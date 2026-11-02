import type { ProviderHeaders } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  CONVERSATION_ID_HEADER,
  DEFAULT_ATTRIBUTION_URL,
  provenanceRequestHeaders,
  withProvenanceHeaders,
} from "./headers";

type TrackedOptions =
  | { headers?: ProviderHeaders; sessionId?: string }
  | undefined;

function fakeStreams() {
  const stream = vi.fn(
    (_model: unknown, _mid: unknown, _options?: TrackedOptions) =>
      createAssistantMessageEventStream(),
  );
  const streamSimple = vi.fn(
    (_model: unknown, _mid: unknown, _options?: TrackedOptions) =>
      createAssistantMessageEventStream(),
  );
  const fetchDeferred = vi.fn(
    (_model: unknown, _handle: unknown, _options?: TrackedOptions) =>
      createAssistantMessageEventStream(),
  );
  const cancelDeferred = vi.fn(
    async (_model: unknown, _handle: unknown, _options?: TrackedOptions) =>
      undefined,
  );
  const streams = { stream, streamSimple, fetchDeferred, cancelDeferred };
  const options = (fn: { mock: { calls: unknown[][] } }): TrackedOptions =>
    fn.mock.calls.at(-1)?.[2] as TrackedOptions;
  return { streams, options };
}

describe("provenanceRequestHeaders", () => {
  it("defaults the Referer to pi.dev", () => {
    expect(provenanceRequestHeaders(undefined)).toEqual({
      Referer: DEFAULT_ATTRIBUTION_URL,
    });
  });

  it("uses the configured referer", () => {
    expect(
      provenanceRequestHeaders({ referer: "https://app.example" }),
    ).toEqual({
      Referer: "https://app.example",
    });
  });

  it("adds nothing when provenance is disabled", () => {
    expect(provenanceRequestHeaders({ enabled: false })).toBeUndefined();
  });
});

describe("withProvenanceHeaders", () => {
  it("returns the same streams when there are no headers", () => {
    const { streams } = fakeStreams();
    expect(withProvenanceHeaders(streams, undefined)).toBe(streams);
  });

  it("adds the headers to every stream method", () => {
    const { streams, options } = fakeStreams();
    const headers: ProviderHeaders = { Referer: DEFAULT_ATTRIBUTION_URL };
    const wrapped = withProvenanceHeaders(streams, headers);
    const model = { id: "m" } as never;
    const context = { messages: [] } as never;

    wrapped.streamSimple(model, context, undefined);
    expect(streams.streamSimple.mock.calls[0]?.[0]).toBe(model);
    expect(streams.streamSimple.mock.calls[0]?.[1]).toBe(context);
    expect(options(streams.streamSimple)?.headers).toEqual(headers);

    wrapped.stream(model, context, undefined);
    expect(options(streams.stream)?.headers).toEqual(headers);

    wrapped.fetchDeferred?.(model, {} as never, undefined);
    expect(options(streams.fetchDeferred)?.headers).toEqual(headers);

    wrapped.cancelDeferred?.(model, {} as never, undefined);
    expect(options(streams.cancelDeferred)?.headers).toEqual(headers);
  });

  it("takes the conversation id from the request's sessionId", () => {
    const { streams, options } = fakeStreams();
    const wrapped = withProvenanceHeaders(streams, {
      Referer: DEFAULT_ATTRIBUTION_URL,
    });

    wrapped.streamSimple({} as never, {} as never, { sessionId: "s1" });
    expect(options(streams.streamSimple)?.headers).toEqual({
      Referer: DEFAULT_ATTRIBUTION_URL,
      [CONVERSATION_ID_HEADER]: "s1",
    });

    wrapped.streamSimple({} as never, {} as never, undefined);
    expect(options(streams.streamSimple)?.headers).toEqual({
      Referer: DEFAULT_ATTRIBUTION_URL,
    });
  });

  it("lets caller header values win", () => {
    const { streams, options } = fakeStreams();
    const wrapped = withProvenanceHeaders(streams, {
      Referer: DEFAULT_ATTRIBUTION_URL,
    });
    wrapped.streamSimple({} as never, {} as never, {
      sessionId: "s1",
      headers: { Referer: "https://caller.example", "X-App": "1" },
    });
    expect(options(streams.streamSimple)?.headers).toEqual({
      Referer: "https://caller.example",
      [CONVERSATION_ID_HEADER]: "s1",
      "X-App": "1",
    });
  });
});
