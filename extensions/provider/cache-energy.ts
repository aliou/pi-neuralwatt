import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ModelRegistry,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

const NOISE_FLOOR_TOKENS = 1_024;
const SIGNIFICANT_MISSED_TOKENS = 20_000;
const SIGNIFICANT_MISSED_COST = 0.1;

interface PreviousRequest {
  promptTokens: number;
  timestamp: number;
  reportedCache: boolean;
}

function requestTokens(message: AssistantMessage): number {
  const { usage } = message;
  return usage.input + usage.cacheRead + usage.cacheWrite;
}

function asPreviousRequest(
  message: AssistantMessage,
  reportedCache: boolean,
): PreviousRequest | undefined {
  const promptTokens = requestTokens(message);
  if (promptTokens <= 0) return;
  return {
    promptTokens,
    timestamp: message.timestamp,
    reportedCache:
      reportedCache || message.usage.cacheRead + message.usage.cacheWrite > 0,
  };
}

function findPreviousRequest(
  entries: SessionEntry[],
): PreviousRequest | undefined {
  let previous: PreviousRequest | undefined;

  for (const entry of entries) {
    if (entry.type === "compaction" || entry.type === "branch_summary") {
      previous = undefined;
      continue;
    }
    if (entry.type === "usage" && entry.kind === "cache_warm") {
      const { usage } = entry;
      const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
      if (promptTokens > 0) {
        previous = {
          promptTokens,
          timestamp: Date.parse(entry.timestamp),
          reportedCache: true,
        };
      }
      continue;
    }
    if (entry.type !== "message" || entry.message.role !== "assistant")
      continue;
    previous =
      asPreviousRequest(entry.message, previous?.reportedCache ?? false) ??
      previous;
  }

  return previous;
}

export function isSignificantCacheMiss(
  entries: SessionEntry[],
  message: AssistantMessage,
  models: Pick<ModelRegistry, "find">,
): boolean {
  const previous = findPreviousRequest(entries);
  if (!previous) return false;

  const { usage } = message;
  const promptTokens = requestTokens(message);
  if (promptTokens <= 0) return false;
  if (usage.cacheRead + usage.cacheWrite === 0 && !previous.reportedCache) {
    return false;
  }

  const missedTokens =
    Math.min(previous.promptTokens, promptTokens) - usage.cacheRead;
  if (missedTokens <= NOISE_FLOOR_TOKENS) return false;

  const paidTokens = usage.input + usage.cacheWrite;
  const paidPerToken =
    paidTokens > 0
      ? (usage.cost.input + usage.cost.cacheWrite) / paidTokens
      : 0;
  const readPerToken =
    usage.cacheRead > 0
      ? usage.cost.cacheRead / usage.cacheRead
      : (models.find(message.provider, message.model)?.cost.cacheRead ?? 0) /
        1_000_000;
  const missedCost = missedTokens * Math.max(0, paidPerToken - readPerToken);

  return (
    missedTokens >= SIGNIFICANT_MISSED_TOKENS ||
    missedCost >= SIGNIFICANT_MISSED_COST
  );
}
