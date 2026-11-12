import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { isSignificantCacheMiss } from "./cache-energy";

const models = { find: () => undefined };

function assistant(
  input: number,
  cacheRead: number,
  cacheWrite: number,
  inputPrice = 0.15,
): AssistantMessage {
  const inputCost = (input * inputPrice) / 1_000_000;
  const cacheReadCost = (cacheRead * 0.015) / 1_000_000;
  return {
    role: "assistant",
    content: [],
    api: "openai-completions",
    provider: "neuralwatt",
    model: "test-model",
    usage: {
      input,
      output: 0,
      cacheRead,
      cacheWrite,
      totalTokens: input + cacheRead + cacheWrite,
      cost: {
        input: inputCost,
        output: 0,
        cacheRead: cacheReadCost,
        cacheWrite: 0,
        total: inputCost + cacheReadCost,
      },
    },
    stopReason: "stop",
    timestamp: 1_000,
  };
}

function messageEntry(message: AssistantMessage): SessionEntry {
  return {
    type: "message",
    id: "message-1",
    parentId: null,
    timestamp: new Date(message.timestamp).toISOString(),
    message,
  };
}

describe("isSignificantCacheMiss", () => {
  it("detects a full miss after cache activity", () => {
    const entries = [messageEntry(assistant(0, 0, 30_000))];
    expect(
      isSignificantCacheMiss(entries, assistant(30_000, 0, 0), models),
    ).toBe(true);
  });

  it("ignores cache hits, noise, and requests without cache history", () => {
    const cachedEntries = [messageEntry(assistant(0, 0, 30_000))];
    expect(
      isSignificantCacheMiss(cachedEntries, assistant(0, 30_000, 0), models),
    ).toBe(false);
    expect(
      isSignificantCacheMiss(cachedEntries, assistant(1_000, 0, 0), models),
    ).toBe(false);

    const uncachedEntries = [messageEntry(assistant(30_000, 0, 0))];
    expect(
      isSignificantCacheMiss(uncachedEntries, assistant(30_000, 0, 0), models),
    ).toBe(false);
  });

  it("counts smaller misses with a significant cost", () => {
    const entries = [messageEntry(assistant(0, 0, 10_000))];
    expect(
      isSignificantCacheMiss(entries, assistant(10_000, 0, 0, 15), models),
    ).toBe(true);
  });

  it("resets detection after compaction", () => {
    const entries: SessionEntry[] = [
      messageEntry(assistant(0, 0, 30_000)),
      {
        type: "compaction",
        id: "compact-1",
        parentId: "message-1",
        timestamp: new Date(2_000).toISOString(),
        summary: "summary",
        firstKeptEntryId: "message-2",
        tokensBefore: 30_000,
      },
    ];
    expect(
      isSignificantCacheMiss(entries, assistant(30_000, 0, 0), models),
    ).toBe(false);
  });
});
